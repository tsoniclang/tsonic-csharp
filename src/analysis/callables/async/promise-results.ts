import type { Node, Type } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { analyzeSourceDeclarationGenericAdoption, sourceGenericAdoptionDiagnosticCode,
  createSourceDeclarationOwnershipQuery,
  createSourceDeclarationOwnershipBudget, defaultSourceDeclarationOwnershipLimits,
  type SourceDeclarationOwnershipBudget, type SourceDeclarationOwnershipPremises,
  type SourceDeclarationOwnershipUnresolved } from "@tsonic/target-api/analysis";
import { sourceExpressionResultDisposition, type TargetSourceProgram } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileType } from "../../../policy/identities/source-types.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import type { CsharpNativeUseClassifications } from "../../../target-model/records/native/native-demand.js";
import type { CsharpStorageRepresentationClassifications } from "../../../target-model/records/storage/storage.js";
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
      message: issue.message, evidence: issue.evidence })));
}

export function analyzeCsharpPromiseResults(input: {
  readonly source: TargetSourceProgram;
  readonly projectRoot: string;
  readonly nodes: readonly Node[];
  readonly records: CsharpValueReadClassifications & CsharpNativeUseClassifications &
    Pick<CsharpStorageRepresentationClassifications, "storageType"> &
    Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">;
  readonly definitions: CsharpTypeDefinitions;
  readonly nativePlacement: readonly TargetDiagnostic[];
}): { readonly results: CsharpPromiseResults; readonly diagnostics: readonly TargetDiagnostic[] } {
  const results = new Map<Node, CsharpPromiseResult>();
  const diagnostics: TargetDiagnostic[] = [];
  const { source } = input;
  const { ast } = source;
  if (input.nativePlacement.length !== 0) return Object.freeze({ results, diagnostics: input.nativePlacement });
  const root = input.nodes[0] ?? source.sourceFiles[0];
  if (root === undefined) return Object.freeze({ results, diagnostics: Object.freeze([]) });
  const budget = createSourceDeclarationOwnershipBudget(root, defaultSourceDeclarationOwnershipLimits);
  const nativeCarrier = (node: Node): TargetTypeRef | undefined => {
    const native = input.records.nativeUse.expression(node)?.use;
    if (native !== undefined) return native.kind === "erased" ? undefined
      : native.completion.kind === "value" ? native.completion.type : native.carrier;
    return input.records.storageType.get(node) ?? input.records.valueRead.get(node)?.value;
  };
  const runtimeNode = (node: Node): boolean => {
    if (!ast.is.IsIdentifier(node)) return true;
    const call = ast.parent(node);
    if (call === undefined || !ast.is.IsCallExpression(call) && !ast.is.IsNewExpression(call)) return true;
    const native = input.records.nativeUse.expression(call)?.use;
    if (native === undefined || native.kind === "erased" || input.records.nativeUse.expression(node) !== undefined) return true;
    if (ast.is.IsCallExpression(call)) {
      const selected = input.records.selectedCall.get(call);
      return selected?.sourceCall?.kind !== "function" || selected.source?.sourceCallee.expression !== node;
    }
    const selected = input.records.selectedConstruction.get(call)?.target;
    return selected?.kind !== "resolved" && selected?.kind !== "source-owned" ||
      selected.source.sourceCallee.expression !== node;
  };
  const nodes: Node[] = [];
  for (const node of input.nodes) {
    if (!budget.step(node)) return Object.freeze({ results,
      diagnostics: Object.freeze([ownershipDiagnostic(budget.failure()!)]) });
    if (runtimeNode(node)) nodes.push(node);
  }
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
      const output = nativeCarrier(node);
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
      const carrier = nativeCarrier(value.node);
      if (carrier === undefined || carrier.kind === "opaque" || isCsharpRefLikeTargetType(carrier))
        return unresolved(value.node, "Continuation retention requires this exact value's completed native CLR placement and carrier.");
      return Object.freeze({ kind: "resolved", premises: Object.freeze([Object.freeze({ kind: "retained", value,
        reason: "owned-value", contract: Object.freeze({ kind: "expression", expression: value.node,
          component: value.component }) })]) });
    },
    suspensionFor(value) {
      const call = ast.is.IsCallExpression(value.node) || ast.is.IsNewExpression(value.node);
      const carrier = nativeCarrier(value.node);
      if (carrier === undefined) return undefined;
      const task = selectCsharpPromiseDiscard(carrier, input.definitions);
      if (task.kind === "unsupported") return unresolved(value.node, task.reason);
      if (call && input.records.selectedCall.get(value.node) === undefined &&
        input.records.selectedConstruction.get(value.node) === undefined) return undefined;
      return Object.freeze({ kind: task.discard === undefined ? "never" : "may-suspend", value,
        contract: Object.freeze({ kind: "expression", expression: value.node, component: value.component }) });
    },
  };
  diagnostics.push(...analyzeCsharpGenericAdoption({ source, projectRoot: input.projectRoot, nodes, premises, budget }));
  if (diagnostics.length !== 0) return Object.freeze({ results, diagnostics: Object.freeze(diagnostics) });
  const ownership = createSourceDeclarationOwnershipQuery({ source, sourceNodes: input.nodes, nodes, budget, premises });
  for (const node of nodes) {
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node)) continue;
    const carrier = nativeCarrier(node);
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
