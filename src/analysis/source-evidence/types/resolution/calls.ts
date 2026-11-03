import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import { resolveProjectConstructingReceiverTargetType } from "./expressions.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";

import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { nextState } from "./state.js";

import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

import { ObjectLiteralProperty_Value } from "@tsonic/target-api/source";
import { resolveTypeParameter } from "./source-evidence.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { bindCsharpSourceDeclarationArguments, bindCsharpSourceTypeArguments } from "./generic-arguments.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { completeCsharpSourceCallInference, type CsharpSourceCallInference } from "./call-inference.js";
import { completeCsharpSourceCallableTypeSource, type CsharpSourceCallableTypeInput,
  type CsharpSourceCallableTypeCompletion } from "./call-type-source.js";
import type { CsharpSourceCallReceiverInput, CsharpSourceCallReceiverCompletion } from "./receiver-completions.js";
import { formCsharpSourceCallConstructionSource } from "./expression-source.js";
import { formCsharpSourceCallContractSource } from "./call-contracts.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function resolveSourceCallInstantiation(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  expectedTypeParameterIdentities?: readonly string[],
  callable?: SourceCallableContract,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
):
  | {
      readonly arguments: readonly TargetTypeRef[];
      readonly substitutions: ReadonlyMap<string, TargetTypeRef>;
      readonly sourceArguments: readonly Type[];
      readonly inference: CsharpSourceCallInference | undefined;
    }
  | undefined {
  const { host, inferSourceCallTargetTypeArguments, resolveAuthoredAndSelectedSourceType } = scope;
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const sourceArguments = Object.freeze(selectedArguments.map(argument => argument.selectedType));
  const owner = callable?.sourceDeclaration ?? source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const projections = owner === undefined ? [] : host.representations.genericProjections(owner);
  if (expectedTypeParameterIdentities?.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
      sourceArguments,
      inference: undefined,
    };
  }
  const parameterIdentities = sourceCallTypeParameterIdentities(scope, source, callable,
    callable === undefined ? "value" : "declaration");
  if (parameterIdentities === undefined) return undefined;
  const identities = [...parameterIdentities, ...projections.map(projection => projection.identity)];
  if (
    expectedTypeParameterIdentities !== undefined &&
    (
      identities.length !== expectedTypeParameterIdentities.length ||
      new Set(identities).size !== identities.length ||
      new Set(expectedTypeParameterIdentities).size !== expectedTypeParameterIdentities.length ||
      parameterIdentities.some((name, index) =>
        name !== expectedTypeParameterIdentities[index]
      ) || expectedTypeParameterIdentities.slice(parameterIdentities.length).some(identity =>
        !projections.some(projection => projection.identity === identity))
    )
  ) {
    return undefined;
  }
  if (identities.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
      sourceArguments,
      inference: undefined,
    };
  }
  const inferredParameterIdentities = new Set(
    selectedArguments.flatMap((argument, index) => argument.explicitTypeNode === undefined ? [parameterIdentities[index]!] : []),
  );
  const inferenceRequired = inferredParameterIdentities.size !== 0 &&
    (callable !== undefined || excludedSourceArgumentIndexes !== undefined);
  const inference = inferenceRequired ? inferSourceCallTargetTypeArguments(
    source,
    callable,
    sourceFile,
    inferredParameterIdentities,
    nextState(state),
    excludedSourceArgumentIndexes,
  ) : undefined;
  if (inferenceRequired && inference === undefined) {
    return undefined;
  }
  const selectedParameters = new Set<Type>();
  const arguments_: TargetTypeRef[] = [];
  const substitutions = new Map<string, TargetTypeRef>();
  for (const [index, selected] of selectedArguments.entries()) {
    const parameterIdentity = parameterIdentities[index]!;
    if (
      selected.typeParameterName.length === 0 ||
      selectedParameters.has(selected.typeParameter) ||
      substitutions.has(parameterIdentity)
    ) {
      return undefined;
    }
    let targetArgument = selected.explicitTypeNode === undefined
      ? inference?.bindings.get(parameterIdentity)?.type ??
        (excludedSourceArgumentIndexes === undefined ? resolveAuthoredAndSelectedSourceType(
          undefined,
          sourceFile,
          selected.selectedType,
          sourceFile,
          nextState(state),
        ) : undefined)
      : resolveAuthoredAndSelectedSourceType(
          selected.explicitTypeNode,
          sourceFile,
          selected.selectedType,
          sourceFile,
          nextState(state),
        );
    if (targetArgument === undefined && excludedSourceArgumentIndexes !== undefined && selected.explicitTypeNode === undefined) {
      const declared = callable?.sourceDeclaration === undefined ? undefined
        : host.ast.typeParameters(callable.sourceDeclaration)[index];
      const native = declared === undefined ? undefined : csharpSourceTypeParameter(declared, host.ast);
      const checked = resolveTypeParameter(selected.typeParameter, host.semantics(sourceFile), host.ast, host.typeParameterConstraints);
      targetArgument = native?.identity === parameterIdentity ? native
        : checked?.kind === "type-parameter" && checked.identity === parameterIdentity ? checked : undefined;
    }
    if (targetArgument === undefined) {
      return undefined;
    }
    selectedParameters.add(selected.typeParameter);
    substitutions.set(parameterIdentity, targetArgument);
    arguments_.push(targetArgument);
  }
  if (owner !== undefined && projections.length > 0) {
    const results = resolveCsharpProjectionArguments(scope, owner, sourceArguments, arguments_, state, projections);
    if (results === undefined) return undefined;
    for (const [index, result] of results.entries()) {
      substitutions.set(projections[index]!.identity, result);
      arguments_.push(result);
    }
  }
  return {
    arguments: Object.freeze((expectedTypeParameterIdentities ?? identities).map(identity => substitutions.get(identity)!)),
    substitutions,
    sourceArguments,
    inference,
  };
}
export function resolveSourceCallSelectedType(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  declaration: Node | undefined,
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined {
  const { host, resolveAuthoredAndSelectedSourceType, resolveNodeWithState, resolveSourceCallInstantiation, resolveSourceCallReceiverTargetType } = scope;
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
    undefined,
    undefined,
    excludedSourceArgumentIndexes,
  );
  if (instantiation === undefined) {
    return undefined;
  }
  const receiver = source.sourceReceiver ?? source.sourceCalleeAccess?.receiver;
  if (receiver !== undefined && (declaration === undefined || !host.navigation.isProjectDeclaration(declaration))) {
    const bound = bindCsharpSourceTypeArguments(scope, receiver.type, host.semantics(selectedSourceFile), state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  if (authoredTypeNode !== undefined && host.ast.is.IsThisTypeNode(authoredTypeNode)) {
    if (selectedType === undefined) return undefined;
    const receiverType = resolveSourceCallReceiverTargetType(source, selectedSourceFile, nextState(state));
    return source.optionalChain ? getCsharpNullableElementTargetType(receiverType) ?? receiverType : receiverType;
  }
  const authoredSourceFile = host.ast.getSourceFile(authoredTypeNode) ??
    selectedSourceFile;
  if (authoredTypeNode !== undefined && host.hasSemantics(authoredSourceFile) && instantiation.sourceArguments.length > 0) {
    const selectedDeclaration = source.sourceSelectedSignatureKind === "resolved"
      ? host.semantics(selectedSourceFile).declarations.signatureDeclaration(source.selectedSignature) : undefined;
    if (selectedDeclaration === undefined) return undefined;
    const bound = bindCsharpSourceDeclarationArguments(scope, selectedDeclaration,
      instantiation.arguments.slice(0, instantiation.sourceArguments.length),
      instantiation.sourceArguments, state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  const authored = authoredTypeNode === undefined ||
      !host.hasSemantics(authoredSourceFile)
    ? undefined
    : resolveNodeWithState(
        authoredTypeNode,
        authoredSourceFile,
        nextState(state),
      );
  const instantiated = authored === undefined
    ? undefined
    : substituteTargetTypeParameters(
        authored,
        instantiation.substitutions,
      );
  const receiverType = resolveSourceCallReceiverTargetType(
    source,
    selectedSourceFile,
    state,
  );
  const receiverInstantiation = instantiated === undefined
    ? { kind: "not-project-member" as const }
    : host.projectTypes().instantiateMemberType(
        declaration,
        receiverType,
        instantiated,
      );
  if (receiverInstantiation.kind === "unresolved") {
    return undefined;
  }
  if (receiverInstantiation.kind === "resolved") {
    return receiverInstantiation.type;
  }
  // A provider declaration has no semantics, so its authored parameter type is not resolved above, and the checker's
  // instantiated parameter type loses source primitive aliases (`int32[]` reads as `number[]`). The declared (generic)
  // parameter type with the call's own type-argument substitutions is the exact parameter.
  if (authored === undefined && authoredTypeNode !== undefined && declaration !== undefined &&
    !host.hasSemantics(authoredSourceFile)) {
    const declared = host.semantics(selectedSourceFile).declarations.declaredValueType(declaration);
    const generic = declared === undefined ? undefined : scope.resolveTypeWithState(declared, selectedSourceFile, nextState(state));
    const substituted = generic === undefined ? undefined : substituteTargetTypeParameters(generic, instantiation.substitutions);
    if (generic !== undefined && substituted !== undefined && !targetTypeRefEquals(generic, substituted)) return substituted;
  }
  if (excludedSourceArgumentIndexes !== undefined) {
    if (authored !== undefined) return instantiated;
    if (source.sourceSelectedMethodTypeArguments?.some(argument => argument.explicitTypeNode === undefined)) return undefined;
  }
  if (
    authored !== undefined &&
    instantiated !== undefined &&
    (instantiation.sourceArguments.length > 0 || !targetTypeRefEquals(authored, instantiated))
  ) {
    return instantiated;
  }
  return resolveAuthoredAndSelectedSourceType(
    authoredTypeNode,
    authoredSourceFile,
    selectedType,
    selectedSourceFile,
    state,
  );
}

export function resolveSourceCallableContractType(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined {
  const construction = scope.host.ast.kindName(source.sourceCallee.expression) !== "KindSuperKeyword" &&
    scope.host.ast.is.IsNewExpression(source.call)
    ? formCsharpSourceCallConstructionSource(scope, formCsharpSourceCallContractSource(scope, source, selectedSourceFile))
    : undefined;
  return completeCsharpSourceCallableType(scope, Object.freeze({ source, callable, type,
    sourceFile: selectedSourceFile, state, excludedSourceArgumentIndexes, construction }))?.type;
}

export function completeCsharpSourceCallableType(
  { host, resolveSourceCallInstantiation, completeSourceCallReceiver }: CsharpTypeResolutionScope,
  input: CsharpSourceCallableTypeInput,
): CsharpSourceCallableTypeCompletion | undefined {
  const completion = completeCsharpSourceCallableTypeSource(input);
  let step = completion.next();
  while (!step.done) {
    const request = step.value;
    if (request.kind === "instantiation") {
      step = completion.next(Object.freeze({ kind: "instantiation", request,
        instantiation: resolveSourceCallInstantiation(input.source, input.sourceFile, request.state,
          input.callable.nativeSignature.methodTypeParameterIdentities, input.callable, input.excludedSourceArgumentIndexes) }));
    } else if (request.kind === "receiver") {
      step = completion.next(Object.freeze({ kind: "receiver", request,
        completion: completeSourceCallReceiver(request.receiverInput) }));
    } else if (request.kind === "declaration") {
      step = completion.next(Object.freeze({ kind: "declaration", request,
        result: host.projectTypeABI().instantiateDeclarationType(input.callable.nativeSignature.receiverTypeOwner,
          request.receiverType, request.substituted) }));
    } else {
      step = completion.next(Object.freeze({ kind: "shape", request,
        shape: host.structuralTypes.resolveTarget(request.receiverType) }));
    }
  }
  return step.value;
}

export function inferSourceCallTargetTypeArguments(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract | undefined,
  sourceFile: SourceFile,
  parameterIdentities: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): CsharpSourceCallInference | undefined {
  return completeCsharpSourceCallInference(scope, source, callable, sourceFile, parameterIdentities, state, excludedSourceArgumentIndexes);
}

export function sourceCallSelectedDeclaration(
  {  }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
): Node | undefined {
  return source.sourceCalleeAccess?.selectedDeclaration ??
    source.sourceCallee.selectedDeclaration;
}

export function resolveSourceCallReceiverTargetType(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const construction = scope.host.ast.kindName(source.sourceCallee.expression) !== "KindSuperKeyword" &&
    scope.host.ast.is.IsNewExpression(source.call)
    ? formCsharpSourceCallConstructionSource(scope, formCsharpSourceCallContractSource(scope, source, selectedSourceFile))
    : undefined;
  return completeCsharpSourceCallReceiver(scope, Object.freeze({ source, sourceFile: selectedSourceFile, state, construction }))?.type;
}

export function completeCsharpSourceCallReceiver(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceCallReceiverInput,
): CsharpSourceCallReceiverCompletion | undefined {
  const { host, completeSelectedReceiver, resolveFormedSourceOwnedConstructionResult, resolveTypeWithState, resolveNodeWithState } = scope;
  const { source, sourceFile, state } = input;
  if (host.ast.kindName(source.sourceCallee.expression) === "KindSuperKeyword") {
    const type = resolveProjectConstructingReceiverTargetType(scope, source.sourceCallee.expression);
    return type === undefined ? undefined : Object.freeze({ input, kind: "super", type });
  }
  if (host.ast.is.IsNewExpression(source.call)) {
    const projectClass = host.ast.is.IsClassDeclaration(source.sourceCallee.selectedDeclaration) &&
      host.navigation.isProjectDeclaration(source.sourceCallee.selectedDeclaration);
    const factory = projectClass ? undefined
      : getCsharpClassFactory(resolveNodeWithState(source.sourceCallee.expression, sourceFile, nextState(state)));
    if (projectClass || factory !== undefined) {
      const construction = input.construction;
      if (construction === undefined || construction.contract.source !== source ||
        construction.contract.sourceFile !== sourceFile) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Construction receiver completion requires its exact retained source input.", source.call);
      }
      const type = resolveFormedSourceOwnedConstructionResult(construction, nextState(state));
      return type === undefined ? undefined : Object.freeze({ input, kind: "owned-construction", projectClass, factory, type });
    }
  }
  if (host.ast.is.IsNewExpression(source.call)) {
    const type = resolveTypeWithState(source.sourceResultType, sourceFile, nextState(state));
    return type === undefined ? undefined : Object.freeze({ input, kind: "construction-result", type });
  }
  const selected = completeSelectedReceiver(Object.freeze({ receiver: source.sourceReceiver, queries: host.semantics(sourceFile), state }));
  return selected === undefined ? undefined : Object.freeze({ input, kind: "selected", selected, type: selected.type });
}

export function sourceCallableTypeParametersMatch(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract,
  kind: "declaration" | "value",
): boolean {
  if (kind === "declaration" && callable.nativeSignature.methodTypeParameterIdentities.length === 0) {
    return true;
  }
  const selected = source.sourceSelectedMethodTypeArguments ?? [];
  const { host } = scope;
  const identities = sourceCallTypeParameterIdentities(scope, source, callable, kind);
  if (identities === undefined) return false;
  const projections = callable.sourceDeclaration === undefined ? []
    : host.representations.genericProjections(callable.sourceDeclaration);
  const native = callable.nativeSignature.methodTypeParameterIdentities;
  return selected.length + projections.length === native.length &&
    new Set(native).size === native.length && new Set([...identities, ...projections.map(projection => projection.identity)]).size === native.length &&
    native.slice(selected.length).every(identity => projections.some(projection => projection.identity === identity)) &&
    identities.every((identity, index) => identity === callable.nativeSignature.methodTypeParameterIdentities[index]);
}

function sourceCallTypeParameterIdentities(
  { host }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract | undefined,
  kind: "declaration" | "value",
): readonly string[] | undefined {
  const selected = source.sourceSelectedMethodTypeArguments ?? [];
  if (selected.length === 0) return [];
  const file = host.ast.getSourceFile(source.sourceCallee.expression);
  if (file === undefined) return undefined;
  const queries = host.semantics(file);
  const checked = queries.declarations.signatureDeclaration(source.selectedSignature);
  const remap = kind === "declaration" && callable?.sourceDeclaration !== undefined &&
    checked !== undefined && checked !== callable.sourceDeclaration;
  if (remap) {
    const reference = host.navigation.sourceReferenceFor(source.sourceCallee.expression);
    const declaration = reference?.declaration ?? source.sourceCalleeAccess?.declaration ?? source.sourceCallee.declaration;
    const initializer = declaration === undefined ? undefined : host.moduleCallables.get(declaration)?.callable;
    const selectedDeclaration = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
    const implementation = initializer === undefined ? host.navigation.callableImplementation(checked) : undefined;
    const matches = initializer === undefined
      ? implementation?.kind === "resolved" && implementation.implementation.declaration === callable.sourceDeclaration
      : initializer === callable.sourceDeclaration && selectedDeclaration !== undefined &&
        (selectedDeclaration === declaration || selectedDeclaration === initializer) && host.navigation.isProjectDeclaration(selectedDeclaration);
    if (!matches ||
        host.ast.typeParameters(checked).length !== selected.length ||
        host.ast.typeParameters(callable.sourceDeclaration!).length !== selected.length) return undefined;
  }
  const identities = selected.map((argument, index) => {
    const parameter = resolveTypeParameter(argument.typeParameter, queries, host.ast, host.typeParameterConstraints);
    if (parameter?.kind !== "type-parameter") return undefined;
    if (!remap) return parameter.identity;
    const checkedParameter = csharpSourceTypeParameter(host.ast.typeParameters(checked!)[index]!, host.ast);
    if (checkedParameter?.identity !== parameter.identity) return undefined;
    return csharpSourceTypeParameter(host.ast.typeParameters(callable!.sourceDeclaration!)[index]!, host.ast)?.identity;
  });
  return identities.some(identity => identity === undefined) ? undefined : identities as readonly string[];
}

export function sourceValueDeclaration(
  { host }: CsharpTypeResolutionScope,
  node: Node,
  referenced: Node | undefined,
): Node | undefined {
  if (
    host.ast.is.IsVariableDeclaration(node) ||
    host.ast.is.IsBindingElement(node) ||
    host.ast.is.IsParameterDeclaration(node) ||
    host.ast.is.IsPropertyDeclaration(node) ||
    host.ast.is.IsPropertyAssignment(node) ||
    host.ast.is.IsShorthandPropertyAssignment(node)
  ) {
    return node;
  }
  if (host.ast.is.IsPropertyAccessExpression(node)) {
    referenced = host.semanticsFor(node).operations.propertyAccess(node)?.selectedDeclaration;
  } else if (host.ast.is.IsElementAccessExpression(node)) {
    referenced = host.semanticsFor(node).operations.elementAccess(node)?.selectedDeclaration;
  }
  return referenced !== undefined && host.navigation.isProjectDeclaration(referenced) &&
      (
        host.ast.is.IsVariableDeclaration(referenced) ||
        host.ast.is.IsBindingElement(referenced) ||
        host.ast.is.IsParameterDeclaration(referenced) ||
        host.ast.is.IsPropertyDeclaration(referenced) ||
        host.ast.is.IsPropertyAssignment(referenced) ||
        host.ast.is.IsShorthandPropertyAssignment(referenced)
      )
    ? referenced
    : undefined;
}

export function sourceValueDeclarationSyntax(
  { host }: CsharpTypeResolutionScope,
  declaration: Node,
): {
  readonly type?: Node;
  readonly initializer?: Node;
} {
  if (host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)) {
    const initializer = ObjectLiteralProperty_Value(host.ast, declaration);
    return initializer === undefined ? {} : { initializer };
  }
  if (host.ast.is.IsVariableDeclaration(declaration)) {
    const value = host.ast.as.AsVariableDeclaration(declaration);
    return {
      ...(value?.Type === undefined ? {} : { type: value.Type }),
      ...(value?.Initializer === undefined
        ? {}
        : { initializer: value.Initializer }),
    };
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    const value = host.ast.as.AsBindingElement(declaration);
    return value?.Initializer === undefined
      ? {}
      : { initializer: value.Initializer };
  }
  if (host.ast.is.IsParameterDeclaration(declaration)) {
    const value = host.ast.as.AsParameterDeclaration(declaration);
    return {
      ...(value?.Type === undefined ? {} : { type: value.Type }),
      ...(value?.Initializer === undefined
        ? {}
        : { initializer: value.Initializer }),
    };
  }
  const value = host.ast.as.AsPropertyDeclaration(declaration);
  return {
    ...(value?.Type === undefined ? {} : { type: value.Type }),
    ...(value?.Initializer === undefined
      ? {}
      : { initializer: value.Initializer }),
  };
}
