import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceDeclarationIsModuleScoped, sourceEnclosingCallable, sourceParameterIsProperty, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpCallableContractIndex } from "../callables/model.js";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpClassFactory } from "../../target-model/records/class-factories.js";
import type { CsharpClassPropertyStorage } from "../../target-model/records/class-property-storage.js";
import type { CsharpNativeParticipationInput } from "../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { getCsharpGeneratorProtocol } from "../../target-model/types/carriers/generators.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";
import { analyzeCsharpRefLikeLiveness, analyzeCsharpRefLikeEvaluation } from "./ref-like-liveness.js";

export interface CsharpNativePlacementInput {
  readonly source: TargetSourceProgram;
  readonly nodes: readonly Node[];
  readonly callables: CsharpCallableContractIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly classFactories: readonly CsharpClassFactory[];
  readonly nativeParticipation: CsharpNativeParticipationInput;
  readonly nativeDemand: CsharpNativeDemandAnalysis;
  readonly operations: CsharpTargetOperationClassifications;
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">;
  readonly definitions: CsharpTypeDefinitions;
  readonly classPropertyStorage: { readonly get: (declaration: Node) => CsharpClassPropertyStorage | undefined };
  readonly generatorFor: (declaration: Node) => boolean;
  readonly bindingCarrierFor: (declaration: Node) => TargetTypeRef | undefined;
  readonly expressionCarrierFor: (expression: Node) => TargetTypeRef | undefined;
}

export function analyzeCsharpRefLikePlacements(input: CsharpNativePlacementInput): readonly TargetDiagnostic[] {
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
  const fieldHasStorage = (declaration: Node): boolean => {
    if (ast.is.IsGetAccessorDeclaration(declaration) || ast.is.IsSetAccessorDeclaration(declaration) ||
      ast.is.IsPropertySignatureDeclaration(declaration)) return false;
    const selection = input.classPropertyStorage.get(declaration);
    return !(selection?.kind === "property" && ast.hasModifierKind(declaration, "abstract"));
  };
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
        if (elements.some(isCsharpRefLikeTargetType)) reject(node,
          current.kind === "array" ? "CSHARP_REFLIKE_ARRAY_ELEMENT" : "CSHARP_REFLIKE_TUPLE_ELEMENT",
          "A native ref-like value cannot be stored in an ordinary array or value tuple element.");
        pending.push(...elements);
      } else if (current.kind === "target-named") {
        const named = current as CsharpTargetNamedTypeRef;
        const arguments_ = current.typeArguments ?? [];
        const allowed = named.csharpAllowsRefLikeTypeArguments;
        if (!Array.isArray(allowed) || allowed.length !== arguments_.length || allowed.some(value => typeof value !== "boolean")) {
          reject(node, "CSHARP_REFLIKE_METADATA_NOT_PROVEN", "A physical native carrier requires exact generic-slot anti-constraint metadata.");
          continue;
        }
        const taskResult = getCsharpTaskResultTargetType(current);
        if (isCsharpRefLikeTargetType(taskResult)) reject(node, "CSHARP_REFLIKE_ASYNC_RESULT",
          "A native Task result cannot contain a ref-like value.");
        const generator = getCsharpGeneratorProtocol(current);
        if (isCsharpRefLikeTargetType(generator?.yieldType)) reject(node, "CSHARP_REFLIKE_ITERATOR_ELEMENT",
          "A native iterator cannot yield a ref-like value.");
        for (const [index, argument] of arguments_.entries()) {
          if (argument !== taskResult && argument !== generator?.yieldType && isCsharpRefLikeTargetType(argument) && !allowed[index]) {
            reject(node, "CSHARP_REFLIKE_GENERIC_ARGUMENT", "The selected native generic parameter does not allow ref struct arguments.");
          }
          pending.push(argument);
        }
        const arms = input.definitions.sourceUnionArms(current);
        if (arms !== undefined) {
          if (arms.some(isCsharpRefLikeTargetType)) reject(node, "CSHARP_REFLIKE_FIELD",
            "An ordinary source union cannot store a native ref-like payload.");
          pending.push(...arms);
        }
        const shape = input.objectShapes.resolveTarget(current);
        if (shape !== undefined && named.csharpStructuralContract !== true && !isCsharpRefLikeTargetType(current)) {
          for (const member of shape.members) {
            if (member.memberKind !== "property" || member.sourceDeclarations !== undefined && member.sourceDeclarations.length > 0 &&
              member.sourceDeclarations.every(declaration => !fieldHasStorage(declaration))) continue;
            if (isCsharpRefLikeTargetType(member.type)) reject(member.sourceDeclarations?.[0] ?? node, "CSHARP_REFLIKE_FIELD",
              "A native ref-like value cannot be retained in an ordinary object member.");
            pending.push(member.type);
          }
        }
      }
    }
  };
  for (const lexical of input.captureStorage.lexicalCaptures) {
    if (!participates(lexical.owner)) continue;
    for (const capture of lexical.values) {
      if (isCsharpRefLikeTargetType(capture.type)) reject(capture.declaration, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be captured by a native callable body.");
      inspect(capture.type, capture.declaration);
    }
    for (const receiver of lexical.receivers) if (isCsharpRefLikeTargetType(receiver.type)) reject(receiver.owner,
      "CSHARP_REFLIKE_FRAME_CAPTURE", "A native ref-like receiver cannot be captured by a native callable body.");
  }
  for (const factory of input.classFactories) {
    if (!participates(factory.declaration)) continue;
    for (const capture of factory.captures) {
      const type = input.captureStorage.physicalStorageType.get(capture.declaration, capture.type);
      if (isCsharpRefLikeTargetType(type)) reject(capture.declaration, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be captured in a source class environment.");
      inspect(type, capture.declaration);
    }
  }
  for (const frame of input.captureStorage.frames) {
    if (!participates(frame.scope)) continue;
    for (const binding of frame.bindings) {
      if (isCsharpRefLikeTargetType(binding.type)) reject(binding.declaration, "CSHARP_REFLIKE_FRAME_CAPTURE",
        "A native ref-like value cannot be captured in a retained callable frame.");
      inspect(binding.type, binding.declaration);
    }
    for (const receiver of frame.receivers) if (isCsharpRefLikeTargetType(receiver.type)) reject(receiver.owner,
      "CSHARP_REFLIKE_FRAME_CAPTURE", "A native ref-like receiver cannot be captured in a retained callable frame.");
  }
  for (const node of input.nodes) {
    if (!participates(node)) continue;
    if (ast.is.IsVariableDeclaration(node) || ast.is.IsBindingElement(node) || ast.is.IsPropertyDeclaration(node)) {
      const type = input.bindingCarrierFor(node);
      inspect(type, node);
      if (!isCsharpRefLikeTargetType(type)) continue;
      if (ast.is.IsPropertyDeclaration(node)) {
        if (fieldHasStorage(node)) reject(node, "CSHARP_REFLIKE_FIELD", "A native ref-like value cannot be stored in an ordinary source field or backing property.");
      } else if (sourceDeclarationIsModuleScoped(node, ast)) {
        reject(node, "CSHARP_REFLIKE_MODULE_FIELD", "A native ref-like value cannot be stored in a static module field or backing property.");
      } else {
        const owner = sourceEnclosingCallable(node, ast);
        if (owner === undefined) reject(node, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "The exact native ref-like binding's lexical lifetime is not proven.");
        else {
          const bindings = scopedBindings.get(owner) ?? new Set<Node>();
          bindings.add(node);
          scopedBindings.set(owner, bindings);
        }
      }
    } else if (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node)) {
      inspect(input.expressionCarrierFor(node), node);
      const call = ast.is.IsCallExpression(node) ? input.operations.selectedCall.get(node) : input.operations.selectedConstruction.get(node);
      if (call?.target?.kind === "resolved") {
        const selected = call.target.call;
        for (const [index, argument] of selected.targetMethodTypeArguments.entries()) {
          const parameter = selected.targetMember.typeParameters?.[index];
          if (parameter === undefined || typeof parameter.csharpAllowsRefLike !== "boolean") {
            reject(node, "CSHARP_REFLIKE_METADATA_NOT_PROVEN", "A selected native generic method requires exact per-parameter anti-constraint metadata.");
          } else if (isCsharpRefLikeTargetType(argument.targetType) && !parameter.csharpAllowsRefLike) {
            reject(node, "CSHARP_REFLIKE_GENERIC_ARGUMENT", "The selected native generic method parameter does not allow ref struct arguments.");
          }
        }
        for (const [index, argument] of selected.targetInvocationTypeArguments.entries()) {
          const allowed = selected.targetMember.csharpInvocationAllowsRefLikeTypeArguments?.[index];
          if (typeof allowed !== "boolean") reject(node, "CSHARP_REFLIKE_METADATA_NOT_PROVEN",
            "A native invocation generic slot requires its exact anti-constraint metadata.");
          else if (isCsharpRefLikeTargetType(argument.targetType) && !allowed) reject(node, "CSHARP_REFLIKE_GENERIC_ARGUMENT",
            "The selected native invocation slot does not allow ref struct arguments.");
        }
      } else if (ast.is.IsCallExpression(node)) {
        const sourceCall = input.operations.selectedCall.get(node);
        const callee = sourceCall?.sourceCall;
        if (callee !== undefined && callee.kind !== "rejected" && sourceCall?.sourceTypeArguments !== undefined) {
          const allowed = callee.kind === "function" || callee.kind === "method"
            ? [input.callables.get({ kind: "declaration", declaration: callee.declaration })?.methodAllowsRefLikeTypeArguments]
            : callee.kind === "union-method" && sourceCall.unionCall?.kind === "resolved"
              ? sourceCall.unionCall.methods.map(method => input.callables.get({ kind: "declaration",
                  declaration: method.declaration })?.methodAllowsRefLikeTypeArguments)
              : [sourceCall.sourceMethodValue?.allowsRefLikeTypeArguments];
          for (const [index, argument] of sourceCall.sourceTypeArguments.entries()) {
            if (allowed.length === 0 || allowed.some(parameters => typeof parameters?.[index] !== "boolean")) reject(node, "CSHARP_REFLIKE_METADATA_NOT_PROVEN",
              "A selected source generic method requires its exact declared anti-constraint metadata.");
            else if (isCsharpRefLikeTargetType(argument) && allowed.some(parameters => !parameters![index])) reject(node, "CSHARP_REFLIKE_GENERIC_ARGUMENT",
              "The source generic method does not declare a native allows-ref-struct anti-constraint.");
          }
        }
      }
    }
  }
  for (const contract of input.callables.declarationContracts) {
    const declaration = contract.sourceDeclaration;
    if (!participates(declaration)) continue;
    inspect(contract.returnType, declaration);
    for (const parameter of contract.parameters) {
      inspect(parameter.targetParameter.type, parameter.sourceParameter);
      if (isCsharpRefLikeTargetType(parameter.targetParameter.type) && sourceParameterIsProperty(ast, parameter.sourceParameter)) {
        reject(parameter.sourceParameter, "CSHARP_REFLIKE_FIELD", "A native ref-like value cannot be stored in an ordinary source field.");
      }
    }
    if ((!ast.hasModifierKind(declaration, "async") && !input.generatorFor(declaration)) || ast.body(declaration) === undefined) continue;
    for (const parameter of contract.parameters) if (isCsharpRefLikeTargetType(parameter.targetParameter.type)) reject(parameter.sourceParameter,
      "CSHARP_REFLIKE_ASYNC_PARAMETER", "A native async or iterator method cannot declare a ref-like parameter.");
    const owned = scopedBindings.get(declaration);
    if (owned !== undefined && owned.size > 0) analyzeCsharpRefLikeLiveness(input.source, declaration, owned, reject);
  }
  for (const { use } of input.nativeDemand.entries) {
    if (use.kind === "constructed") inspect(use.carrier, use.expression);
  }
  analyzeCsharpRefLikeEvaluation(input.source, input.nativeDemand, reject);
  return Object.freeze(diagnostics);
}
