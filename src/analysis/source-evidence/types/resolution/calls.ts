import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import { resolveProjectConstructingReceiverTargetType } from "./expressions.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";

import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { nextState } from "./state.js";

import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { resolveTypeParameter } from "./source-evidence.js";

import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { bindCsharpSourceDeclarationArguments, bindCsharpSourceTypeArguments } from "./generic-arguments.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { resolveCsharpEffectiveCallTypeArgument, resolveCsharpSourceEffectiveType } from "./effective-types.js";
import { sourceCallProjectionInput } from "./call-projection-input.js";

export function resolveSourceCallInstantiation(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  expectedTypeParameterIdentities?: readonly string[],
  callable?: SourceCallableContract,
):
  | {
      readonly arguments: readonly TargetTypeRef[];
      readonly substitutions: ReadonlyMap<string, TargetTypeRef>;
      readonly sourceArguments: readonly Type[];
    }
  | undefined {
  const { host } = scope;
  if (host.ast.getSourceFile(source.call) !== sourceFile) return undefined;
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const sourceArguments = Object.freeze(selectedArguments.map(argument => argument.selectedType));
  const owner = callable?.sourceDeclaration ?? source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const projections = owner === undefined ? [] : host.representations.genericProjections(owner);
  if (expectedTypeParameterIdentities?.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
      sourceArguments,
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
    };
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
    const effective = resolveCsharpEffectiveCallTypeArgument(scope, source, selected.typeParameter, nextState(state));
    const targetArgument = effective?.type;
    if (targetArgument === undefined) {
      return undefined;
    }
    selectedParameters.add(selected.typeParameter);
    substitutions.set(parameterIdentity, targetArgument);
    arguments_.push(targetArgument);
  }
  if (owner !== undefined && projections.length > 0) {
    const publication = sourceCallProjectionInput(scope, source, owner, parameterIdentities);
    if (publication === undefined) return undefined;
    const results = resolveCsharpProjectionArguments(scope, owner, publication, arguments_, state, projections);
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
  );
  if (instantiation === undefined) {
    return undefined;
  }
  const receiver = source.sourceReceiver ?? source.sourceCalleeAccess?.receiver;
  if (receiver !== undefined && (declaration === undefined || !host.navigation.isProjectDeclaration(declaration))) {
    const bound = bindCsharpSourceTypeArguments(scope, receiver.type, host.semantics(selectedSourceFile), state, source);
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
      instantiation.sourceArguments, state, host.semantics(selectedSourceFile));
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
  if (authored === undefined && authoredTypeNode !== undefined && declaration !== undefined &&
    !host.hasSemantics(authoredSourceFile)) {
    const published = resolveCsharpSourceEffectiveType(scope, declaration, nextState(state));
    const generic = published?.result?.selectedType;
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
  { host, resolveSourceCallInstantiation, resolveSourceCallReceiverTargetType }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
    callable.nativeSignature.methodTypeParameterIdentities,
    callable,
  );
  if (instantiation === undefined) {
    return undefined;
  }
  const substituted = substituteTargetTypeParameters(
    type,
    instantiation.substitutions,
  );
  const receiverType = resolveSourceCallReceiverTargetType(
    source,
    selectedSourceFile,
    state,
  );
  const receiverInstantiation = callable.nativeSignature.receiverTypeOwner === undefined
    ? { kind: "not-project-member" as const }
    : host.projectTypes().instantiateDeclarationType(
        callable.nativeSignature.receiverTypeOwner,
        receiverType,
        substituted,
      );
  if (receiverInstantiation.kind === "unresolved") {
    return undefined;
  }
  if (receiverInstantiation.kind === "resolved") return receiverInstantiation.type;
  const shape = receiverType === undefined ? undefined : host.structuralTypes.resolveTarget(receiverType);
  const template = shape?.declarationTemplate?.targetType;
  if (template?.kind !== "target-named" || receiverType === undefined) return substituted;
  const names = new Set((template.typeArguments ?? []).flatMap(argument =>
    argument.kind === "type-parameter" ? [argument.identity] : []));
  const bindings = inferCsharpTargetTypeParameterBindings(template, receiverType, names);
  return bindings === undefined ? undefined : substituteTargetTypeParameters(substituted, bindings);
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
  const { host, resolveSelectedReceiverTargetType, resolveSourceOwnedConstructionResult, resolveTypeWithState, resolveNodeWithState } = scope;
  // Only a construction's published result is its receiver; a method call's receiver is its receiver expression.
  if (host.ast.is.IsNewExpression(source.call)) {
    const effective = resolveCsharpSourceEffectiveType(scope, source.call, state);
    if (effective !== undefined) return effective.result?.selectedType;
  }
  if (host.ast.kindName(source.sourceCallee.expression) === "KindSuperKeyword") {
    return resolveProjectConstructingReceiverTargetType(scope, source.sourceCallee.expression);
  }
  if (host.ast.is.IsNewExpression(source.call) && (
    host.ast.is.IsClassDeclaration(source.sourceCallee.selectedDeclaration) &&
    host.navigation.isProjectDeclaration(source.sourceCallee.selectedDeclaration) ||
    getCsharpClassFactory(resolveNodeWithState(source.sourceCallee.expression, selectedSourceFile, nextState(state))) !== undefined)) {
    return resolveSourceOwnedConstructionResult(source, host.semantics(selectedSourceFile), nextState(state));
  }
  return host.ast.is.IsNewExpression(source.call)
    ? resolveTypeWithState(
        source.sourceResultType,
        selectedSourceFile,
        nextState(state),
      )
    : resolveSelectedReceiverTargetType(
        source.sourceReceiver,
        host.semantics(selectedSourceFile),
        state,
      );
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
