import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { analyzeSourceDeclarationGenericAdoption, sourceGenericAdoptionDiagnosticCode,
  sourceGenericAdoptionDiagnosticMessage, createSourceDeclarationOwnershipQuery,
  createSourceDeclarationOwnershipBudget, defaultSourceStorageLimits,
  type SourceDeclarationOwnershipBudget, type SourceDeclarationOwnershipPremises,
  type SourceDeclarationOwnershipUnresolved } from "@tsonic/target-api/analysis";
import { sourceExpressionResultDisposition, type TargetSourceProgram } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileType } from "../../../policy/identities/source-types.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import type { CsharpPromiseDiscard, CsharpPromiseResult, CsharpPromiseResults } from "../../../target-model/records/callables/promise-results.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { isCsharpRefLikeTargetType } from "../../../target-model/types/ref-like.js";
import { selectCsharpPromiseDiscard } from "../../../policy/types/callables/promise-results.js";

function ownershipDiagnostic(selection: SourceDeclarationOwnershipUnresolved): TargetDiagnostic {
  const cause = selection.cause;
  return Object.freeze({ code: cause.kind === "resource-limit" ? "TSONIC_COMPILER_RESOURCE_LIMIT"
    : "CSHARP_ASYNC_RESULT_USE_NOT_PROVEN", category: "error", source: "tsonic-csharp",
    sourceNode: cause.kind === "resource-limit" ? cause.subject : selection.at,
    message: selection.reason, evidence: Object.freeze(cause.kind === "resource-limit"
      ? [`resource.category=${cause.category}`, `resource.limit=${cause.limit}`]
      : ["target.capability=csharp.async.native-result-use"]) });
}

export function analyzeCsharpGenericAdoption(input: {
  readonly source: TargetSourceProgram;
  readonly projectRoot: string;
  readonly nodes: readonly Node[];
  readonly premises: Pick<SourceDeclarationOwnershipPremises, "completionFor">;
  readonly budget: SourceDeclarationOwnershipBudget;
}): readonly TargetDiagnostic[] {
  const adoption = analyzeSourceDeclarationGenericAdoption(input);
  return Object.freeze(adoption.kind === "unresolved" ? [ownershipDiagnostic(adoption)]
    : adoption.issues.map(issue => Object.freeze({ code: sourceGenericAdoptionDiagnosticCode,
      category: "error" as const, source: "tsonic-csharp", sourceNode: issue.site, sourceSpan: issue.sourceSpan,
      message: sourceGenericAdoptionDiagnosticMessage, evidence: issue.evidence })));
}

export function analyzeCsharpPromiseResults(input: {
  readonly source: TargetSourceProgram;
  readonly projectRoot: string;
  readonly nodes: readonly Node[];
  readonly records: CsharpValueReadClassifications & Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">;
  readonly definitions: CsharpTypeDefinitions;
  readonly sourceCarrier: (type: Type, file: SourceFile) => TargetTypeRef | undefined;
  readonly nativePlacement: readonly TargetDiagnostic[];
}): { readonly results: CsharpPromiseResults; readonly diagnostics: readonly TargetDiagnostic[] } {
  const results = new Map<Node, CsharpPromiseResult>();
  const diagnostics: TargetDiagnostic[] = [];
  const { source } = input;
  const { ast } = source;
  if (input.nativePlacement.length !== 0) return Object.freeze({ results, diagnostics: input.nativePlacement });
  const root = input.nodes[0] ?? source.sourceFiles[0];
  if (root === undefined) return Object.freeze({ results, diagnostics: Object.freeze([]) });
  const budget = createSourceDeclarationOwnershipBudget(root, defaultSourceStorageLimits);
  const unresolved = (at: Node, reason: string): SourceDeclarationOwnershipUnresolved =>
    Object.freeze({ kind: "unresolved", at, reason, cause: Object.freeze({ kind: "required-fact" }) });
  const refused = new WeakSet<Node>();
  const select = (carrier: TargetTypeRef, node: Node): CsharpPromiseDiscard | undefined => {
    const selected = selectCsharpPromiseDiscard(carrier, input.definitions);
    if (selected.kind === "selected") return selected.discard;
    if (!refused.has(node)) {
      refused.add(node);
      diagnostics.push(ownershipDiagnostic(unresolved(node, selected.reason)));
    }
    return undefined;
  };
  const premises: SourceDeclarationOwnershipPremises = {
    completionFor(node, selected) {
      const semantics = source.semantics.forNode(node);
      const declaration = semantics.declarations.signatureDeclaration(selected.selectedSignature);
      if (declaration === undefined) return unresolved(node, "Async result-use requires its exact checked selected declaration.");
      let native = false;
      let js = false;
      const active = new Set<Type>();
      let incomplete: SourceDeclarationOwnershipUnresolved | undefined;
      const inspect = (type: Type): void => {
        if (!budget.step(node)) { incomplete ??= budget.failure(); return; }
        if (active.has(type)) { incomplete ??= unresolved(node, "The selected async result has a cyclic checked completion topology."); return; }
        active.add(type);
        if (semantics.types.isUnion(type) || semantics.types.isIntersection(type)) {
          for (const part of semantics.types.unionOrIntersectionTypes(type)) inspect(part);
        } else {
          const profile = classifyCsharpSourceProfileType(type, semantics, ast);
          if (profile?.kind === "promise") {
            if (profile.ownerId === "js") js = true; else native = true;
          }
        }
        active.delete(type);
      };
      inspect(selected.sourceResultType);
      if (incomplete !== undefined) return incomplete;
      const output = input.records.valueRead.get(node)?.value;
      if (output === undefined) return native || js
        ? unresolved(node, "The selected asynchronous operation has no completed native output carrier.")
        : Object.freeze({ kind: "not-async" });
      const task = selectCsharpPromiseDiscard(output, input.definitions);
      if (task.kind === "unsupported") return unresolved(node, task.reason);
      if (task.discard !== undefined && !js) native = true;
      if (!native && !js) return Object.freeze({ kind: "not-async" });
      return Object.freeze({ kind: "async", resultPolicy: js ? native ? "must-observe" : "observe-rejection" : "native-discard",
        contract: Object.freeze({ kind: "declaration", declaration,
          component: Object.freeze({ selectedType: selected.sourceResultType, contextualCall: selected }) }) });
    },
    retentionFor(request) {
      const { value } = request;
      const file = ast.getSourceFile(value.node);
      const operation = ast.is.IsCallExpression(value.node) || ast.is.IsNewExpression(value.node);
      const carrier = operation || request.kind === "read-value" ? input.records.valueRead.get(value.node)?.value
        : file === undefined ? undefined : input.sourceCarrier(value.component.selectedType, file);
      if (carrier === undefined || carrier.kind === "opaque" || isCsharpRefLikeTargetType(carrier))
        return unresolved(value.node, "Continuation retention requires this exact value's completed native CLR placement and carrier.");
      return Object.freeze({ kind: "resolved", premises: Object.freeze([Object.freeze({ kind: "retained", value,
        reason: "owned-value", contract: Object.freeze({ kind: "expression", expression: value.node,
          component: value.component }) })]) });
    },
    suspensionFor(value) {
      const call = ast.is.IsCallExpression(value.node) || ast.is.IsNewExpression(value.node);
      const file = ast.getSourceFile(value.node);
      const carrier = call ? input.records.valueRead.get(value.node)?.value
        : input.records.valueRead.get(value.node)?.value ??
          (file === undefined ? undefined : input.sourceCarrier(value.component.selectedType, file));
      if (carrier === undefined) return undefined;
      const task = selectCsharpPromiseDiscard(carrier, input.definitions);
      if (task.kind === "unsupported") return unresolved(value.node, task.reason);
      if (call && input.records.selectedCall.get(value.node) === undefined &&
        input.records.selectedConstruction.get(value.node) === undefined) return undefined;
      return Object.freeze({ kind: task.discard === undefined ? "never" : "may-suspend", value,
        contract: Object.freeze({ kind: "expression", expression: value.node, component: value.component }) });
    },
  };
  diagnostics.push(...analyzeCsharpGenericAdoption({ source, projectRoot: input.projectRoot, nodes: input.nodes, premises, budget }));
  if (diagnostics.length !== 0) return Object.freeze({ results, diagnostics: Object.freeze(diagnostics) });
  const ownership = createSourceDeclarationOwnershipQuery({ source, nodes: input.nodes, budget, premises });
  for (const node of input.nodes) {
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node)) continue;
    const carrier = input.records.valueRead.get(node)?.value;
    const selection = carrier === undefined ? undefined : select(carrier, node);
    if (selection === undefined) continue;
    const disposition = sourceExpressionResultDisposition(ast, node);
    let observeDiscard = false;
    if (ast.is.IsCallExpression(node)) {
      const selected = ownership.forCall(node);
      if (selected.kind === "unresolved") { diagnostics.push(ownershipDiagnostic(selected)); continue; }
      if (selected.kind === "resolved" && selected.decision === "rejected") {
        diagnostics.push(Object.freeze({ code: selected.diagnostic.code, category: "error", source: "tsonic-csharp",
          sourceNode: selected.diagnostic.at, message: selected.diagnostic.message }));
        continue;
      }
      observeDiscard = selected.kind === "resolved" && selected.decision === "observe-discarded-rejection";
    } else {
      const semantics = source.semantics.forNode(node);
      const checked = semantics.types.expressionType(node);
      const profile = checked === undefined ? undefined : classifyCsharpSourceProfileType(checked, semantics, ast);
      observeDiscard = profile?.kind === "promise" && profile.ownerId === "js";
    }
    results.set(node, Object.freeze({ disposition, ...(disposition.kind === "discarded" && observeDiscard ? { discard: selection } : {}) }));
  }
  return Object.freeze({ results, diagnostics: Object.freeze(diagnostics) });
}
