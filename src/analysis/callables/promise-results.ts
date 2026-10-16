import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { createSourceStorageBudget, defaultSourceStorageLimits, decideSourceAsyncResultUse, createSourceControlFlow,
  solveSourceFlow, type SourceStorageQueries } from "@tsonic/target-api/analysis";
import { sourceEnclosingCallable, sourceExpressionResultDisposition, sourceParameterIsProperty, type TargetSourceProgram } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileType } from "../../policy/types/resolution/source-profile.js";
import type { CsharpProgramRecords } from "../../target-model/records/program.js";
import type { CsharpPromiseDiscard, CsharpPromiseResult, CsharpPromiseResults } from "../../target-model/records/promise-results.js";
import { getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpCallableContractIndex } from "./model.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpClassFactory } from "../../target-model/records/class-factories.js";
import type { CsharpNativeParticipationInput } from "../../target-model/records/native-demand.js";

export function analyzeCsharpRefLikePlacements(input: {
  readonly source: TargetSourceProgram;
  readonly nodes: readonly Node[];
  readonly callables: CsharpCallableContractIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly classFactories: readonly CsharpClassFactory[];
  readonly nativeParticipation: CsharpNativeParticipationInput;
  readonly generatorFor: (declaration: Node) => boolean;
  readonly bindingCarrierFor: (declaration: Node) => TargetTypeRef | undefined;
  readonly expressionCarrierFor: (expression: Node) => TargetTypeRef | undefined;
}): readonly TargetDiagnostic[] {
  const diagnostics: TargetDiagnostic[] = [];
  const rejected = new Map<Node, Set<string>>();
  const scopedBindings = new Map<Node, Set<Node>>();
  const { ast } = input.source;
  const participating = new Map<Node, boolean>();
  const participates = (node: Node): boolean => {
    const cached = participating.get(node);
    if (cached !== undefined) return cached;
    const owners: Node[] = [];
    let current: Node | undefined = node;
    let selected = true;
    while (current !== undefined) {
      const completed = participating.get(current);
      if (completed !== undefined) { selected = completed; break; }
      owners.push(current);
      if (input.nativeParticipation.participation.get(current) === "erased") { selected = false; break; }
      current = ast.parent(current);
    }
    for (const owner of owners) participating.set(owner, selected);
    return selected;
  };
  const reject = (node: Node, code: string, message: string): void => {
    const codes = rejected.get(node) ?? new Set<string>();
    if (codes.has(code)) return;
    codes.add(code);
    rejected.set(node, codes);
    diagnostics.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", sourceNode: node,
      message, evidence: ["target.capability=csharp.native.ref-like-placement"] }));
  };
  const isRefLike = (type: TargetTypeRef | undefined): boolean => type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpByRefLike === true;
  const inspect = (type: TargetTypeRef | undefined, node: Node): void => {
    if (type === undefined) return;
    const pending = [type];
    const visited = new Set<TargetTypeRef>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (current.kind === "array" || current.kind === "tuple") {
        const elements = current.kind === "array" ? [current.element] : current.elements;
        if (elements.some(isRefLike)) reject(node, "CSHARP_REFLIKE_GENERIC_ARGUMENT",
          "A ref-like native value cannot be stored in an array or an ordinary value tuple.");
        pending.push(...elements);
      } else if (current.kind === "target-named") {
        const taskResult = getCsharpTaskResultTargetType(current);
        if (isRefLike(taskResult)) reject(node, "CSHARP_REFLIKE_ASYNC_RESULT",
          "A native Task result cannot contain a ref-like value.");
        const allowed = (current as CsharpTargetNamedTypeRef).csharpAllowsRefLikeTypeArguments;
        for (const [index, argument] of (current.typeArguments ?? []).entries()) {
          if (argument !== taskResult && isRefLike(argument) && allowed !== undefined && allowed[index] !== true) {
            reject(node, "CSHARP_REFLIKE_GENERIC_ARGUMENT",
              "The selected native generic parameter does not allow ref struct arguments.");
          }
          pending.push(argument);
        }
      }
    }
  };
  for (const lexical of input.captureStorage.lexicalCaptures) {
    if (!participates(lexical.owner)) continue;
    for (const capture of lexical.values) {
      if (isRefLike(capture.type)) reject(capture.declaration, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be captured by a native callable body.");
      inspect(capture.type, capture.declaration);
    }
    for (const receiver of lexical.receivers) {
      if (isRefLike(receiver.type)) reject(receiver.owner, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like receiver cannot be captured by a native callable body.");
    }
  }
  for (const factory of input.classFactories) {
    if (!participates(factory.declaration)) continue;
    for (const capture of factory.captures) {
      const type = input.captureStorage.physicalStorageType.get(capture.declaration, capture.type);
      if (isRefLike(type)) reject(capture.declaration, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be captured in a source class environment.");
      inspect(type, capture.declaration);
    }
  }
  for (const frame of input.captureStorage.frames) {
    if (!participates(frame.scope)) continue;
    for (const binding of frame.bindings) {
      if (isRefLike(binding.type)) reject(binding.declaration, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be captured in a retained callable frame.");
      inspect(binding.type, binding.declaration);
    }
    for (const receiver of frame.receivers) {
      if (isRefLike(receiver.type)) reject(receiver.owner, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like receiver cannot be captured in a retained callable frame.");
    }
  }
  for (const node of input.nodes) {
    if (!participates(node)) continue;
    if (ast.is.IsVariableDeclaration(node) || ast.is.IsPropertyDeclaration(node)) {
      const type = input.bindingCarrierFor(node);
      inspect(type, node);
      if (ast.is.IsVariableDeclaration(node) && isRefLike(type)) {
        const owner = sourceEnclosingCallable(node, ast);
        if (owner !== undefined) {
          const bindings = scopedBindings.get(owner) ?? new Set<Node>();
          bindings.add(node);
          scopedBindings.set(owner, bindings);
        }
      }
      if (ast.is.IsPropertyDeclaration(node) && isRefLike(type)) reject(node, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be stored in an ordinary source object field.");
    } else if (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node)) {
      inspect(input.expressionCarrierFor(node), node);
    }
  }
  for (const contract of input.callables.declarationContracts) {
    const declaration = contract.sourceDeclaration;
    if (!participates(declaration)) continue;
    inspect(contract.returnType, declaration);
    for (const parameter of contract.parameters) {
      inspect(parameter.targetParameter.type, parameter.sourceParameter);
      if (isRefLike(parameter.targetParameter.type) && sourceParameterIsProperty(ast, parameter.sourceParameter)) {
        reject(parameter.sourceParameter, "CSHARP_REFLIKE_FRAME_CAPTURE",
          "A native ref-like value cannot be stored in an ordinary source object field.");
      }
    }
    const generator = input.generatorFor(declaration);
    if (!ast.hasModifierKind(declaration, "async") && !generator || ast.body(declaration) === undefined) continue;
    for (const parameter of contract.parameters) {
      if (isRefLike(parameter.targetParameter.type)) reject(parameter.sourceParameter, "CSHARP_REFLIKE_ASYNC_PARAMETER",
        "A native async or iterator method cannot declare a ref-like parameter.");
    }
    const ownedBindings = scopedBindings.get(declaration);
    if (ownedBindings === undefined || ownedBindings.size === 0) continue;
    const selected = createSourceControlFlow(input.source, declaration);
    if (selected.kind === "unresolved") {
      reject(declaration, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", selected.reason);
      continue;
    }
    const bindings = new Set([...selected.graph.bindings].filter(binding => ownedBindings.has(binding)));
    if (bindings.size === 0) continue;
    const live = solveSourceFlow<ReadonlySet<Node>>(selected.graph, {
      direction: "backward",
      lattice: {
        empty: () => new Set<Node>(),
        join(left, right, work) {
          const result = new Set(left);
          for (const value of right) { work.step(); result.add(value); }
          return result;
        },
        equals: (left, right, work) => left.size === right.size && [...left].every(value => { work.step(); return right.has(value); }),
      },
      transfer(point, state, work) {
        work.step();
        const operation = point.operation;
        if (!("binding" in operation) || !bindings.has(operation.binding)) return state;
        const result = new Set(state);
        if (operation.kind === "read" || operation.kind === "capture") result.add(operation.binding);
        else result.delete(operation.binding);
        return result;
      },
    });
    if (live.kind === "unresolved") { reject(declaration, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", live.reason); continue; }
    for (const point of selected.graph.points) {
      if (!live.reachable.has(point.id) || point.operation.kind !== "await" && point.operation.kind !== "yield") continue;
      for (const binding of live.after.get(point.id) ?? []) reject(binding, "CSHARP_REFLIKE_ACROSS_SUSPENSION",
        "A native ref-like value cannot remain live across an await or yield suspension.");
    }
  }
  return Object.freeze(diagnostics);
}

export function analyzeCsharpPromiseResults(input: {
  readonly source: TargetSourceProgram;
  readonly storage: SourceStorageQueries;
  readonly nodes: readonly Node[];
  readonly records: CsharpProgramRecords;
  readonly definitions: CsharpTypeDefinitions;
  readonly sourceCarrier: (type: Type, file: SourceFile) => TargetTypeRef | undefined;
}): { readonly results: CsharpPromiseResults; readonly diagnostics: readonly TargetDiagnostic[] } {
  const results = new Map<Node, CsharpPromiseResult>();
  const diagnostics: TargetDiagnostic[] = [];
  const budget = createSourceStorageBudget(defaultSourceStorageLimits);
  const { ast } = input.source;
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
  for (const node of input.nodes) {
    if (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node)) continue;
    const carrier = input.records.valueRead.get(node)?.value;
    const selection = carrier === undefined ? undefined : select(carrier);
    if (selection === undefined) continue;
    const disposition = sourceExpressionResultDisposition(ast, node);
    if (disposition.kind !== "discarded") {
      results.set(node, Object.freeze({ disposition }));
      continue;
    }
    const file = ast.getSourceFile(node);
    const semantics = input.source.semantics.forNode(node);
    const type = semantics.types.expressionType(node);
    let native = false;
    let js = false;
    let remaining = 4096;
    const inspect = (selected: Type, depth: number): void => {
      if (--remaining < 0 || depth > 128) { native = true; return; }
      const parts = semantics.types.isUnion(selected) || semantics.types.isIntersection(selected)
        ? semantics.types.unionOrIntersectionTypes(selected) : [];
      if (parts.length > 0) { for (const part of parts) inspect(part, depth + 1); return; }
      const profile = classifyCsharpSourceProfileType(selected, semantics, ast);
      if (profile?.kind === "promise") {
        if (profile.ownerId === "js") js = true;
        else native = true;
      } else {
        const physical = file === undefined ? undefined : input.sourceCarrier(selected, file);
        if (physical !== undefined && select(physical) !== undefined) native = true;
      }
    };
    if (type !== undefined) inspect(type, 0);
    if (!js || native) {
      if (!ast.is.IsCallExpression(node)) { results.set(node, Object.freeze({ disposition })); continue; }
      const call = semantics.operations.call(node);
      const declaration = call?.sourceSelectedSignatureKind === "resolved"
        ? semantics.declarations.signatureDeclaration(call.selectedSignature) : undefined;
      const selected = call === undefined || declaration === undefined
        ? { kind: "unresolved" as const, reason: "Native async result-use requires its exact checked source signature." }
        : decideSourceAsyncResultUse({ source: input.source, storage: input.storage, budget, call: node, disposition,
          completion: { kind: "async", resultPolicy: "must-observe", contractDeclaration: declaration, checkedType: call.sourceResultType },
          continuation: { kind: "unresolved", at: node, reason: "The native discarded-call rule is independent of continuation ownership." } });
      diagnostics.push(Object.freeze({ code: selected.kind === "resolved" && selected.decision === "rejected"
        ? selected.diagnostic.code : "CSHARP_ASYNC_RESULT_USE_NOT_PROVEN", category: "error", source: "tsonic-csharp",
        sourceNode: node, message: selected.kind === "resolved" && selected.decision === "rejected" ? selected.diagnostic.message
          : selected.kind === "unresolved" ? selected.reason : "The native discarded-call decision was not proven.",
        evidence: ["target.capability=csharp.async.native-result-use"] }));
      continue;
    }
    results.set(node, Object.freeze({ disposition, discard: selection }));
  }
  return Object.freeze({ results, diagnostics: Object.freeze(diagnostics) });
}
