import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { analyzeSourceGenericAdoption, sourceGenericAdoptionDiagnosticCode, sourceGenericAdoptionDiagnosticMessage, createSourceOwnershipQuery, createSourceStorageBudget, defaultSourceStorageLimits, type SourceOwnershipPremises, type SourceOwnershipUnresolved, type SourceStorageQueries } from "@tsonic/target-api/analysis";
import { sourceExpressionResultDisposition, type TargetSourceProgram } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileType } from "../../policy/identities/source-types.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpPromiseDiscard, CsharpPromiseResult, CsharpPromiseResults } from "../../target-model/records/promise-results.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";

export function analyzeCsharpGenericAdoption(input: {
  readonly source: TargetSourceProgram;
  readonly projectRoot: string;
  readonly storage: SourceStorageQueries;
}): readonly TargetDiagnostic[] {
  const adoption = analyzeSourceGenericAdoption({ source: input.source, projectRoot: input.projectRoot,
    nodes: input.storage.nodes, storage: input.storage, budget: createSourceStorageBudget(defaultSourceStorageLimits) });
  return Object.freeze(adoption.kind === "unresolved" ? [Object.freeze({ code: "CSHARP_ASYNC_RESULT_USE_NOT_PROVEN",
    category: "error" as const, source: "tsonic-csharp", sourceNode: adoption.at, message: adoption.reason })]
    : adoption.issues.map(issue => Object.freeze({ code: sourceGenericAdoptionDiagnosticCode,
      category: "error" as const, source: "tsonic-csharp", sourceNode: issue.site, sourceSpan: issue.sourceSpan,
      message: sourceGenericAdoptionDiagnosticMessage, evidence: issue.evidence })));
}

export function analyzeCsharpPromiseResults(input: {
  readonly source: TargetSourceProgram;
  readonly genericAdoption: readonly TargetDiagnostic[];
  readonly storage: SourceStorageQueries;
  readonly nodes: readonly Node[];
  readonly records: CsharpValueReadClassifications & Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">;
  readonly definitions: CsharpTypeDefinitions;
  readonly sourceCarrier: (type: Type, file: SourceFile) => TargetTypeRef | undefined;
  readonly nativePlacement: readonly TargetDiagnostic[];
}): { readonly results: CsharpPromiseResults; readonly diagnostics: readonly TargetDiagnostic[] } {
  const results = new Map<Node, CsharpPromiseResult>();
  const diagnostics: TargetDiagnostic[] = [...input.genericAdoption];
  const budget = createSourceStorageBudget(defaultSourceStorageLimits);
  const { ast } = input.source;
  if (input.nativePlacement.length !== 0) return Object.freeze({ results,
    diagnostics: Object.freeze([...input.nativePlacement, ...diagnostics]) });
  const unresolved = (at: Node, reason: string): SourceOwnershipUnresolved => Object.freeze({ kind: "unresolved", at, reason });
  const refused = new WeakSet<Node>();
  const select = (carrier: TargetTypeRef, node: Node): CsharpPromiseDiscard | undefined => {
    const selected = selectCsharpPromiseDiscard(carrier, input.definitions);
    if (selected.kind === "selected") return selected.discard;
    if (!refused.has(node)) {
      refused.add(node);
      diagnostics.push(Object.freeze({ code: "CSHARP_ASYNC_RESULT_USE_NOT_PROVEN", category: "error",
        source: "tsonic-csharp", sourceNode: node, message: selected.reason,
        evidence: Object.freeze(["target.capability=csharp.async.native-result-use"]) }));
    }
    return undefined;
  };
  const premises: SourceOwnershipPremises = {
    completionFor(node, selected) {
      const semantics = input.source.semantics.forNode(node);
      const declaration = semantics.declarations.signatureDeclaration(selected.selectedSignature);
      if (declaration === undefined) return unresolved(node, "Async result-use requires its exact checked source signature.");
      const file = ast.getSourceFile(node);
      let native = false;
      let js = false;
      let incomplete: string | undefined;
      const active = new Set<Type>();
      const inspect = (type: Type): void => {
        if (!budget.step()) { incomplete ??= budget.failure()!; return; }
        if (active.has(type)) { incomplete ??= "The selected async result has a cyclic source completion topology."; return; }
        active.add(type);
        const parts = semantics.types.isUnion(type) || semantics.types.isIntersection(type)
          ? semantics.types.unionOrIntersectionTypes(type) : [];
        if (parts.length > 0) {
          for (const part of parts) inspect(part);
          active.delete(type);
          return;
        }
        const profile = classifyCsharpSourceProfileType(type, semantics, ast);
        if (profile?.kind === "promise") {
          if (profile.ownerId === "js") js = true;
          else native = true;
        } else {
          const carrier = file === undefined ? undefined : input.sourceCarrier(type, file);
          if (carrier !== undefined && select(carrier, node) !== undefined) native = true;
        }
        active.delete(type);
      };
      inspect(selected.sourceResultType);
      return incomplete !== undefined ? unresolved(node, incomplete) : !native && !js ? { kind: "not-async" }
        : { kind: "async", resultPolicy: js && !native ? "observe-rejection" : "must-observe",
          contractDeclaration: declaration, checkedType: selected.sourceResultType };
    },
    retentionFor(value) {
      const checked = input.storage.typeFor(value);
      if (checked.kind === "unresolved") return unresolved(value.node, checked.reason);
      // A retained call result is placed in the carrier its selected operation produces (for example the generator
      // protocol's Task<IteratorResult> for an async generator's next()), as for suspension below.
      const carrier = ast.is.IsCallExpression(value.node) || ast.is.IsNewExpression(value.node)
        ? input.records.valueRead.get(value.node)?.value : input.sourceCarrier(checked.type, checked.sourceFile);
      const uninhabited = input.source.semantics.forNode(value.node).types.isNever(checked.type);
      if (!uninhabited && (carrier === undefined || carrier.kind === "opaque" || isCsharpRefLikeTargetType(carrier))) {
        return unresolved(value.node, "Continuation retention requires this actual value's completed native CLR placement and carrier.");
      }
      return Object.freeze({ kind: "resolved", premises: Object.freeze([Object.freeze({ kind: "retained", value,
        reason: "owned-value", contractDeclaration: value.node, checkedType: checked.type })]) });
    },
    suspensionFor(value) {
      const isCall = ast.is.IsCallExpression(value.node) || ast.is.IsNewExpression(value.node);
      const semantics = input.source.semantics.forNode(value.node);
      const call = isCall ? semantics.operations.call(value.node) : undefined;
      const declaration = call?.sourceSelectedSignatureKind === "resolved"
        ? semantics.declarations.signatureDeclaration(call.selectedSignature) : undefined;
      if (declaration !== undefined && ast.body(declaration) !== undefined) return undefined;
      if (isCall && call?.sourceSelectedSignatureKind !== "resolved") return undefined;
      const checked = input.storage.typeFor(value);
      if (checked.kind === "unresolved") return unresolved(value.node, checked.reason);
      // A call's native result carrier is the one its selected operation produces (for example the generator protocol's
      // Task<IteratorResult> for an async generator's next()), not a carrier re-derived from the checked result type.
      const carrier = isCall ? input.records.valueRead.get(value.node)?.value : input.sourceCarrier(checked.type, checked.sourceFile);
      if (carrier === undefined) return undefined;
      const task = select(carrier, value.node);
      if (isCall && task === undefined && input.records.selectedCall.get(value.node) === undefined &&
        input.records.selectedConstruction.get(value.node) === undefined) return undefined;
      return Object.freeze({ kind: task === undefined ? "never" : "may-suspend", value,
        contractDeclaration: declaration ?? value.node, checkedType: checked.type });
    },
  };
  const ownership = createSourceOwnershipQuery({ source: input.source, storage: input.storage, budget, premises });
  for (const node of input.nodes) {
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node)) continue;
    const carrier = input.records.valueRead.get(node)?.value;
    const selection = carrier === undefined ? undefined : select(carrier, node);
    if (selection === undefined) continue;
    const disposition = sourceExpressionResultDisposition(ast, node);
    if (ast.is.IsCallExpression(node)) {
      const selected = ownership.forCall(node);
      if (selected.kind === "unresolved" || selected.kind === "resolved" && selected.decision === "rejected") {
        diagnostics.push(Object.freeze({ code: selected.kind === "resolved" ? selected.diagnostic!.code
          : "CSHARP_ASYNC_RESULT_USE_NOT_PROVEN", category: "error", source: "tsonic-csharp", sourceNode: node,
          message: selected.kind === "resolved" ? selected.diagnostic!.message : selected.reason,
          evidence: ["target.capability=csharp.async.native-result-use"] }));
        continue;
      }
    }
    results.set(node, Object.freeze({ disposition, ...(disposition.kind === "discarded" ? { discard: selection } : {}) }));
  }
  return Object.freeze({ results, diagnostics: Object.freeze(diagnostics) });
}

import { selectCsharpPromiseDiscard } from "../../policy/types/callables/promise-results.js";
