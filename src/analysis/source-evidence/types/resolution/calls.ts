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

import { Node_Expression, ObjectLiteralProperty_Value, sourceCallableValueParameters, sourceExpressionCallArgument } from "@tsonic/target-api/source";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { selectCsharpObjectLiteralUnionCarrier, csharpObjectLiteralDestinationDeclarations } from "../../../objects/shapes/union-construction.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { resolveTypeParameter } from "./source-evidence.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { getCsharpClassFactory } from "../../../../target-model/types/carriers/class-factories.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { bindCsharpSourceDeclarationArguments, bindCsharpSourceTypeArguments } from "./generic-arguments.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpFreeTypeParameterIdentities } from "../../../../target-model/types/generic-references.js";
import { selectCsharpConversion } from "../../../../policy/conversions/core.js";
import { selectCsharpLiteralDeclarationContext } from "../../../objects/native-construction-demand.js";

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
      readonly state: CsharpTypeResolutionState;
    }
  | undefined {
  const { host, inferSourceCallTargetTypeArguments, resolveAuthoredAndSelectedSourceType } = scope;
  const queries = host.semantics(sourceFile);
  const receiver = source.sourceReceiver ?? source.sourceCalleeAccess?.receiver;
  const declaration = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  if (receiver !== undefined && (declaration === undefined || !host.navigation.isProjectDeclaration(declaration)) &&
    (queries.types.typeArgumentBindings(receiver.type)?.length ?? 0) !== 0) {
    const actual = scope.resolveSourceCallReceiverTargetType(source, sourceFile, nextState(state));
    const bound = bindCsharpSourceTypeArguments(scope, receiver.type, actual, queries, state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const sourceArguments = Object.freeze(selectedArguments.map(argument => argument.selectedType));
  const owner = callable?.sourceDeclaration ?? source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const projections = owner === undefined ? [] : host.representations.genericProjections(owner);
  if (expectedTypeParameterIdentities?.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
      sourceArguments,
      state,
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
      state,
    };
  }
  const inferredParameterIdentities = new Set(
    selectedArguments.flatMap((argument, index) => argument.explicitTypeNode === undefined ? [parameterIdentities[index]!] : []),
  );
  const inferredTargetArguments = inferredParameterIdentities.size === 0
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
  let parameterDeclarations: readonly Node[] = [];
  const candidates = selectedArguments.map((selected, index) => {
    const parameterIdentity = parameterIdentities[index]!;
    const target = selected.explicitTypeNode === undefined ? inferredTargetArguments.get(parameterIdentity)
      : resolveAuthoredAndSelectedSourceType(selected.explicitTypeNode, sourceFile, selected.selectedType, sourceFile, nextState(state));
    if (target !== undefined || excludedSourceArgumentIndexes === undefined || selected.explicitTypeNode !== undefined) return target;
    const declaration = callable?.sourceDeclaration === undefined ? undefined : host.ast.typeParameters(callable.sourceDeclaration)[index];
    const native = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, host.ast);
    if (native?.identity === parameterIdentity) return native;
    const checked = resolveTypeParameter(selected.typeParameter, queries, host.ast, host.typeParameterConstraints);
    return checked?.kind === "type-parameter" && checked.identity === parameterIdentity ? checked : undefined;
  });
  if (selectedArguments.length !== 0) {
    const declarations = [...new Set([callable?.sourceDeclaration, queries.declarations.signatureDeclaration(source.selectedSignature)])]
      .filter((declaration): declaration is Node => declaration !== undefined &&
        host.ast.typeParameters(declaration).length === selectedArguments.length && host.ast.typeParameters(declaration).every((parameter, index) =>
          parameter !== undefined && csharpSourceTypeParameter(parameter, host.ast)?.identity === parameterIdentities[index]));
    if (declarations.length !== 1) return undefined;
    parameterDeclarations = host.ast.typeParameters(declarations[0]!) as readonly Node[];
    const bound = bindCsharpSourceDeclarationArguments(scope, declarations[0]!, candidates, sourceArguments, state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  for (const [index, selected] of selectedArguments.entries()) {
    const parameterIdentity = parameterIdentities[index]!;
    if (
      selected.typeParameterName.length === 0 ||
      selectedParameters.has(selected.typeParameter) ||
      substitutions.has(parameterIdentity)
    ) {
      return undefined;
    }
    const targetArgument = state.sourceBindings?.get(parameterDeclarations[index]!)?.targetType;
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
    state,
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
  state = instantiation.state;
  const receiverType = resolveSourceCallReceiverTargetType(source, selectedSourceFile, nextState(state));
  if (authoredTypeNode !== undefined && host.ast.is.IsThisTypeNode(authoredTypeNode)) {
    if (selectedType === undefined) return undefined;
    return source.optionalChain ? getCsharpNullableElementTargetType(receiverType) ?? receiverType : receiverType;
  }
  const authoredSourceFile = host.ast.getSourceFile(authoredTypeNode) ??
    selectedSourceFile;
  if (authoredTypeNode !== undefined && instantiation.sourceArguments.length > 0) {
    const selectedDeclaration = source.sourceSelectedSignatureKind === "resolved"
      ? host.semantics(selectedSourceFile).declarations.signatureDeclaration(source.selectedSignature) : undefined;
    if (selectedDeclaration === undefined) return undefined;
    const bound = bindCsharpSourceDeclarationArguments(scope, selectedDeclaration,
      instantiation.arguments.slice(0, instantiation.sourceArguments.length),
      instantiation.sourceArguments, state);
    if (bound === undefined) return undefined;
    state = bound;
  }
  const authored = authoredTypeNode === undefined
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
  if (excludedSourceArgumentIndexes !== undefined) {
    if (authored !== undefined) return instantiated;
    if (source.sourceSelectedMethodTypeArguments?.some(argument => argument.explicitTypeNode === undefined)) return undefined;
  }
  if (authoredTypeNode !== undefined) return instantiated;
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
  state = instantiation.state;
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
  const checkedBindings = new Map<string, TargetTypeRef>();
  const identities = sourceCallTypeParameterIdentities(scope, source, callable,
    callable === undefined ? "value" : "declaration");
  if (identities === undefined) return undefined;
  for (const [index, argument] of (source.sourceSelectedMethodTypeArguments ?? []).entries()) {
    const checked = scope.resolveAuthoredAndSelectedSourceType(argument.explicitTypeNode, sourceFile,
      argument.selectedType, sourceFile, nextState(state));
    if (checked !== undefined) checkedBindings.set(identities[index]!, checked);
  }
  const inferencePairs: CsharpSourceArgumentInferencePair[] = [];
  const conflicts = new Set<string>();
  const queries = scope.host.semantics(sourceFile);
  const selection = selectCsharpLiteralDeclarationContext(source.call, queries, scope.host);
  const context = selection?.own === true ? selection : undefined;
  const authoredContext = context?.component.authoredTypeNode;
  const contextFile = authoredContext === undefined ? undefined : scope.host.ast.getSourceFile(authoredContext);
  const argumentContext = sourceExpressionCallArgument(source.call,
    { ast: scope.host.ast, semantics: { forNode: scope.host.semanticsFor } });
  const outerCall = context?.component.contextualCall;
  const outerBindings = argumentContext === undefined ? [] : outerCall?.sourceArgumentBindings.filter(binding =>
    binding.sourceArgumentIndex === argumentContext.argumentIndex && binding.sourceForm === "value") ?? [];
  const parameterContext = outerCall === undefined || argumentContext === undefined || outerBindings.length !== 1 ? undefined
    : scope.resolveSourceCallArgumentParameter(outerCall, outerBindings[0]!, sourceFile, new Set([argumentContext.argumentIndex]));
  const declaredContext = context?.parameterDefault !== undefined
    ? scope.resolveNodeWithState(context.parameterDefault, sourceFile, nextState(state))
    : authoredContext === undefined || contextFile === undefined ? parameterContext
    : scope.resolveNodeWithState(authoredContext, contextFile, nextState(state));
  const resultNode = queries.operations.callResult(source)?.authoredTypeNode;
  const resultFile = resultNode === undefined ? undefined : scope.host.ast.getSourceFile(resultNode);
  const resultPattern = callable?.nativeSignature.sourceReturnType ?? callable?.returnType ??
    (declaredContext === undefined || resultNode === undefined || resultFile === undefined ? undefined
      : scope.resolveNodeWithState(resultNode, resultFile, nextState(state)));
  const declaredBindings = declaredContext === undefined || resultPattern === undefined ? undefined
    : inferCsharpTargetTypeParameterBindings(resultPattern, declaredContext, parameterIdentities);
  if (authoredContext !== undefined && (declaredContext === undefined || resultPattern === undefined || declaredBindings === undefined)) {
    return undefined;
  }
  for (const [name, carrier] of declaredBindings ?? []) inferred.set(name, carrier);
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
    const declaredPattern = csharpTargetParameterValueType(
      parameter,
      binding.sourceForm,
    );
    const pattern = declaredBindings === undefined ? declaredPattern : substituteTargetTypeParameters(declaredPattern, declaredBindings);
    const pairs = sourceArgumentInferencePairs(scope, argument.expression, pattern, sourceFile, state);
    if (pairs === undefined) continue;
    for (const pair of pairs) {
      const arms = getCsharpRuntimeUnionArms(pair.pattern);
      const checkedArms = arms === undefined || getCsharpRuntimeUnionArms(pair.actual) !== undefined || pair.checked === undefined
        ? undefined : arms.filter(arm => inferCsharpTargetTypeParameterBindings(
          substituteTargetTypeParameters(arm, checkedBindings), pair.checked!, new Set()) !== undefined);
      if (checkedArms !== undefined && checkedArms.length > 1) return undefined;
      const selected = { ...pair, pattern: checkedArms?.length === 1 ? checkedArms[0]! : pair.pattern };
      inferencePairs.push(selected);
      const candidates = inferCsharpTargetTypeParameterBindings(selected.pattern, selected.actual, parameterIdentities);
      if (candidates === undefined) continue;
      for (const [name, candidate] of candidates) {
        const existing = inferred.get(name);
        if (existing !== undefined && !targetTypeRefEquals(existing, candidate)) conflicts.add(name);
        else inferred.set(name, candidate);
      }
    }
  }
  if (conflicts.size > 0) {
    for (const pair of inferencePairs) {
      if (![...csharpFreeTypeParameterIdentities([pair.pattern])].some(identity => conflicts.has(identity))) continue;
      const expected = substituteTargetTypeParameters(pair.pattern, checkedBindings);
      if (csharpFreeTypeParameterIdentities([expected]).size > 0) continue;
      const conversion = selectCsharpConversion({ typeDefinitions: scope.host.typeDefinitions,
        projectTypes: scope.host.projectTypes(), providers: scope.host.providers, target: scope.host.target },
      pair.actual, expected, "implicit");
      if (conversion.kind === "rejected") state.rejectNativeResolution?.(Object.freeze({ kind: "rejected",
        subject: pair.expression, code: conversion.code ?? "CSHARP_UNSUPPORTED_AST", reason: conversion.reason }));
    }
    return undefined;
  }
  return inferred;
}

interface CsharpSourceArgumentInferencePair {
  readonly pattern: TargetTypeRef;
  readonly actual: TargetTypeRef;
  readonly checked: TargetTypeRef | undefined;
  readonly expression: Node;
}

function sourceArgumentInferencePairs(
  scope: CsharpTypeResolutionScope,
  literal: Node,
  pattern: TargetTypeRef,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): readonly CsharpSourceArgumentInferencePair[] | undefined {
  const { host, resolveSelectedValueWithState } = scope;
  const literalValue = host.literalValues.literalValue.get(literal);
  if (literalValue?.number !== undefined || literalValue?.integer !== undefined) {
    const actual = scope.resolveNodeWithState(literal, sourceFile, nextState(state));
    const type = host.semantics(sourceFile).types.expressionType(literal);
    return actual === undefined ? undefined : [{ pattern, actual, expression: literal,
      checked: type === undefined ? undefined : scope.resolveTypeWithState(type, sourceFile, nextState(state)) }];
  }
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
    return [{ pattern: expected.returnType, actual: selected.returnType, expression: literal, checked: undefined }];
  }
  if (host.ast.is.IsArrayLiteralExpression(literal)) {
    const element = getCsharpArrayLiteralElementTargetType(pattern);
    const pairs: CsharpSourceArgumentInferencePair[] = [];
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
    if (actual === undefined) return undefined;
    const shape = actual.kind === "target-named" ? host.structuralTypes.resolveTarget(actual) : undefined;
    const implemented = pattern.kind === "target-named" && shape !== undefined && targetTypeRefEquals(shape.targetType, actual)
      ? (shape.implements ?? []).filter(carrier => carrier.kind === "target-named" && carrier.id === pattern.id) : [];
    const checked = scope.resolveTypeWithState(type, sourceFile, nextState(state));
    return [{ pattern, actual, checked, expression: literal },
      ...implemented.map(carrier => ({ pattern, actual: carrier, checked, expression: literal }))];
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
  const pairs: CsharpSourceArgumentInferencePair[] = [];
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
