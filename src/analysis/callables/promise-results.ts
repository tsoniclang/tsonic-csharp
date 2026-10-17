import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { createSourceOwnershipQuery, createSourceStorageBudget, defaultSourceStorageLimits,
  type SourceOwnershipPremises, type SourceOwnershipUnresolved, type SourceStorageQueries } from "@tsonic/target-api/analysis";
import { sourceExpressionResultDisposition, type TargetSourceProgram } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileType } from "../../policy/types/resolution/source-profile.js";
import type { CsharpProgramRecords } from "../../target-model/records/program.js";
import type { CsharpPromiseDiscard, CsharpPromiseResult, CsharpPromiseResults } from "../../target-model/records/promise-results.js";
import { getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";

export function analyzeCsharpPromiseResults(input: {
  readonly source: TargetSourceProgram;
  readonly storage: SourceStorageQueries;
  readonly nodes: readonly Node[];
  readonly records: Pick<CsharpProgramRecords, "valueRead" | "selectedCall" | "selectedConstruction">;
  readonly definitions: CsharpTypeDefinitions;
  readonly sourceCarrier: (type: Type, file: SourceFile) => TargetTypeRef | undefined;
  readonly nativePlacement: readonly TargetDiagnostic[];
}): { readonly results: CsharpPromiseResults; readonly diagnostics: readonly TargetDiagnostic[] } {
  const results = new Map<Node, CsharpPromiseResult>();
  const diagnostics: TargetDiagnostic[] = [];
  if (input.nativePlacement.length !== 0) return Object.freeze({ results, diagnostics: input.nativePlacement });
  const budget = createSourceStorageBudget(defaultSourceStorageLimits);
  const { ast } = input.source;
  const unresolved = (at: Node, reason: string): SourceOwnershipUnresolved => Object.freeze({ kind: "unresolved", at, reason });
  const select = (carrier: TargetTypeRef, depth = 0): CsharpPromiseDiscard | undefined => {
    if (depth > 128) return undefined;
    const nullable = getCsharpNullableElementTargetType(carrier);
    if (nullable !== undefined) {
      const present = select(nullable, depth + 1);
      return present === undefined ? undefined : Object.freeze({ kind: "optional", valueType: isCsharpValueTypeTargetType(nullable), present });
    }
    if (getCsharpTaskResultTargetType(carrier) !== undefined) return Object.freeze({ kind: "task" });
    const alternatives = getCsharpRuntimeUnionArms(carrier, input.definitions);
    if (alternatives === undefined) return undefined;
    const arms = alternatives.flatMap((alternative, index) => {
      const selection = select(alternative, depth + 1);
      return selection === undefined ? [] : [Object.freeze({ index, selection })];
    });
    return arms.length === 0 ? undefined : Object.freeze({ kind: "union", arms: Object.freeze(arms) });
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
          if (carrier !== undefined && select(carrier) !== undefined) native = true;
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
      const carrier = input.sourceCarrier(checked.type, checked.sourceFile);
      if (carrier === undefined || carrier.kind === "opaque" || isCsharpRefLikeTargetType(carrier)) {
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
      if (isCall && input.records.selectedCall.get(value.node) === undefined &&
        input.records.selectedConstruction.get(value.node) === undefined) return undefined;
      const checked = input.storage.typeFor(value);
      if (checked.kind === "unresolved") return unresolved(value.node, checked.reason);
      const carrier = input.sourceCarrier(checked.type, checked.sourceFile);
      if (carrier === undefined) return undefined;
      const task = select(carrier);
      if (!isCall && task === undefined) return undefined;
      return Object.freeze({ kind: task === undefined ? "never" : "may-suspend", value,
        contractDeclaration: declaration ?? value.node, checkedType: checked.type });
    },
  };
  const ownership = createSourceOwnershipQuery({ source: input.source, storage: input.storage, budget, premises });
  for (const node of input.nodes) {
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node)) continue;
    const carrier = input.records.valueRead.get(node)?.value;
    const selection = carrier === undefined ? undefined : select(carrier);
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
