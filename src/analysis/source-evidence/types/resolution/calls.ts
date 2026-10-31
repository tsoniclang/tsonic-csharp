import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import { resolveProjectConstructingReceiverTargetType } from "./expressions.js";
import { csharpSourceCallArgumentParameter } from "../../../../policy/types/callables/source-callable-contract.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";

import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { nextState } from "./state.js";

import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

import { Node_Expression, ObjectLiteralProperty_Value, sourceCallableValueParameters } from "@tsonic/target-api/source";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { selectCsharpObjectLiteralUnionCarrier, csharpObjectLiteralDestinationDeclarations } from "../../../objects/shapes/union-construction.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { resolveTypeParameter } from "./source-evidence.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { bindCsharpSourceDeclarationArguments, bindCsharpSourceTypeArguments } from "./generic-arguments.js";
import { csharpModuleCallableInitializer } from "../../../../target-model/syntax/module-callables.js";

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
  const inferredParameterIdentities = new Set(
    selectedArguments.flatMap((argument, index) => argument.explicitTypeNode === undefined ? [parameterIdentities[index]!] : []),
  );
  const inferredTargetArguments = inferredParameterIdentities.size === 0 ||
      callable === undefined && excludedSourceArgumentIndexes === undefined
    ? new Map<string, TargetTypeRef>()
    : inferSourceCallTargetTypeArguments(
        source,
        callable,
        sourceFile,
        inferredParameterIdentities,
        nextState(state),
        excludedSourceArgumentIndexes,
      );
  if (inferredTargetArguments === undefined) {
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
      ? inferredTargetArguments.get(parameterIdentity) ??
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
    return resolveAuthoredAndSelectedSourceType(
      authoredTypeNode,
      host.ast.getSourceFile(authoredTypeNode) ?? selectedSourceFile,
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
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
    !targetTypeRefEquals(authored, instantiated)
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
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined {
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
    callable.nativeSignature.methodTypeParameterIdentities,
    callable,
    excludedSourceArgumentIndexes,
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

export function inferSourceCallTargetTypeArguments(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: SourceCallableContract | undefined,
  sourceFile: SourceFile,
  parameterIdentities: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const inferred = new Map<string, TargetTypeRef>();
  const contextual = (binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number]): boolean => {
    const argument = source.sourceArguments[binding.sourceArgumentIndex]?.expression;
    const parameter = callable === undefined ? undefined
      : csharpSourceCallArgumentParameter(callable, binding.effectiveArgumentIndex)?.targetParameter;
    return parameter !== undefined && getCsharpCallableValueSignature(csharpTargetParameterValueType(parameter, binding.sourceForm)) !== undefined ||
      argument !== undefined && (scope.host.ast.is.IsArrowFunction(argument) || scope.host.ast.is.IsFunctionExpression(argument));
  };
  const bindings = source.sourceArgumentBindings.filter(binding =>
    excludedSourceArgumentIndexes?.has(binding.sourceArgumentIndex) !== true).sort((left, right) =>
    Number(contextual(left)) - Number(contextual(right)));
  for (const binding of bindings) {
    let parameter = callable === undefined ? undefined
      : csharpSourceCallArgumentParameter(callable, binding.effectiveArgumentIndex)?.targetParameter;
    if (callable === undefined) {
      const selected = source.sourceSelectedSignatureParameters[binding.sourceParameterIndex];
      if (selected === undefined) return undefined;
      const authored = selected.authoredTypeNode;
      const file = authored === undefined ? undefined : scope.host.ast.getSourceFile(authored);
      const type = authored === undefined || file === undefined ? undefined
        : scope.resolveNodeWithState(authored, file, nextState(state));
      if (type === undefined) continue;
      parameter = { name: selected.parameterName, type, passingMode: "by-value", paramsArray: selected.rest };
    }
    const argument = source.sourceArguments[binding.sourceArgumentIndex];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const pattern = csharpTargetParameterValueType(
      parameter,
      binding.sourceForm,
    );
    const pairs = sourceArgumentInferencePairs(scope, argument.expression, pattern, sourceFile, state);
    if (pairs === undefined) continue;
    for (const pair of pairs) {
      const candidates = inferCsharpTargetTypeParameterBindings(pair.pattern, pair.actual, parameterIdentities);
      if (candidates === undefined) continue;
      for (const [name, candidate] of candidates) {
        const existing = inferred.get(name);
        if (existing !== undefined && !targetTypeRefEquals(existing, candidate)) return undefined;
        inferred.set(name, candidate);
      }
    }
  }
  return inferred;
}

function sourceArgumentInferencePairs(
  scope: CsharpTypeResolutionScope,
  literal: Node,
  pattern: TargetTypeRef,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): readonly { readonly pattern: TargetTypeRef; readonly actual: TargetTypeRef }[] | undefined {
  const { host, resolveSelectedValueWithState } = scope;
  const literalValue = host.literalValues.literalValue.get(literal);
  if (literalValue?.number !== undefined || literalValue?.integer !== undefined) return [];
  if (host.ast.is.IsParenthesizedExpression(literal) || host.ast.is.IsSatisfiesExpression(literal)) {
    const inner = Node_Expression(host.ast, literal);
    return inner === undefined ? undefined : sourceArgumentInferencePairs(scope, inner, pattern, sourceFile, nextState(state));
  }
  const expected = getCsharpCallableValueSignature(pattern);
  const inline = host.ast.is.IsArrowFunction(literal) || host.ast.is.IsFunctionExpression(literal);
  if (inline || expected !== undefined) {
    const type = host.semantics(sourceFile).types.expressionType(literal);
    const actual = type === undefined ? undefined : resolveSelectedValueWithState(literal, type, sourceFile, nextState(state));
    const selected = getCsharpCallableValueSignature(actual);
    const parameters = inline ? sourceCallableValueParameters(host.ast, literal, host.semantics(sourceFile)) : undefined;
    if (expected === undefined || selected === undefined || expected.parameters.length !== selected.parameters.length ||
      inline && (parameters === undefined || parameters.some(parameter => parameter === undefined))) return undefined;
    return [{ pattern: expected.returnType, actual: selected.returnType }];
  }
  if (host.ast.is.IsArrayLiteralExpression(literal)) {
    const element = getCsharpArrayLiteralElementTargetType(pattern);
    const pairs: { readonly pattern: TargetTypeRef; readonly actual: TargetTypeRef }[] = [];
    for (const [index, expression] of host.ast.elements(literal).entries()) {
      const selected = pattern.kind === "tuple" ? pattern.elements[index] : element;
      if (expression === undefined || selected === undefined) return undefined;
      const spread = host.ast.is.IsSpreadElement(expression);
      const value = spread ? Node_Expression(host.ast, expression) : expression;
      if (value === undefined || spread && element === undefined) return undefined;
      const children = sourceArgumentInferencePairs(scope, value, spread ? pattern : selected, sourceFile, nextState(state));
      if (children === undefined) return undefined;
      pairs.push(...children);
    }
    return pairs;
  }
  if (!host.ast.is.IsObjectLiteralExpression(literal)) {
    const type = host.semantics(sourceFile).types.expressionType(literal);
    const actual = type === undefined ? undefined : resolveSelectedValueWithState(literal, type, sourceFile, nextState(state));
    return actual === undefined ? undefined : [{ pattern, actual }];
  }
  const elements = host.ast.properties(literal).map(element => {
    if (element === undefined) return undefined;
    const initializer = ObjectLiteralProperty_Value(host.ast, element);
    const evidence = host.semantics(sourceFile).operations.objectLiteralElement(element);
    return initializer === undefined || evidence === undefined ? undefined : { initializer, evidence };
  });
  if (elements.some(element => element === undefined)) return undefined;
  const carrier = selectCsharpObjectLiteralUnionCarrier(pattern, elements.map(element => element!.evidence), host.structuralTypes.resolveTarget,
    (element, candidate) => csharpObjectLiteralDestinationDeclarations(element, candidate, host.semantics(sourceFile)), host.typeDefinitions);
  const shape = host.structuralTypes.resolveTarget(carrier ?? pattern);
  if (shape === undefined) return undefined;
  const pairs: { readonly pattern: TargetTypeRef; readonly actual: TargetTypeRef }[] = [];
  for (const element of elements) {
    const declarations = csharpObjectLiteralDestinationDeclarations(element!.evidence, shape, host.semantics(sourceFile));
    const fields = declarations === undefined ? [] : shape.members.filter(member => member.sourceDeclarations?.some(declaration =>
      declarations.includes(declaration)) === true);
    if (fields.length !== 1) return undefined;
    const children = sourceArgumentInferencePairs(scope, element!.initializer, fields[0]!.type, sourceFile, nextState(state));
    if (children === undefined) return undefined;
    pairs.push(...children);
  }
  return pairs;
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
    const initializer = declaration === undefined ? undefined : csharpModuleCallableInitializer(host.ast, declaration);
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
    host.ast.is.IsPropertyDeclaration(node)
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
        host.ast.is.IsPropertyDeclaration(referenced)
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
