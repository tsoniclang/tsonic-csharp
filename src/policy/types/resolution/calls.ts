import type { CsharpSourceCallableContract } from "../callables/source-callable-contract.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo, CsharpTypeResolutionState } from "./model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../target-model/types/runtime-carriers.js";
import { csharpTargetParameterValueType } from "../../../target-model/types/member-facts.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { nextState } from "./state.js";
import { reconcileCsharpSelectedTargetType } from "./selected-type-evidence.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpAuthoredUnionRefinement, sourceRefinementOnlyRemovesNullish } from "./source-union-refinement.js";
import { Node_Expression, ObjectLiteralProperty_Value } from "@tsonic/target-api/source";
import { selectCsharpObjectLiteralUnionShape } from "../objects/object-shape-policy/union-construction.js";
import { csharpNumericLiteralValue, csharpBigIntLiteralValue } from "../../../target-model/syntax/numeric-literals.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../target-model/types/collections.js";
import { resolveTypeParameter, resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { getCsharpGenericMethodValue } from "../../../target-model/types/generic-method-values.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { getCsharpClassFactory } from "../../../target-model/types/class-factories.js";

export function resolveAuthoredAndSelectedSourceType(
  scope: CsharpTypeResolutionScope,
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveNodeWithState, resolveTypeWithState } = scope;
  const authoredQueries = host.hasSemantics(authoredSourceFile)
    ? host.semantics(authoredSourceFile)
    : undefined;
  const authored = authoredQueries === undefined
    ? undefined
    : resolveNodeWithState(
        authoredTypeNode,
        authoredSourceFile,
        nextState(state),
      );
  if (
    authored === undefined ||
    authoredQueries === undefined ||
    authoredTypeNode === undefined ||
    selectedType === undefined
  ) {
    return authored ?? resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const selectedQueries = host.semantics(selectedSourceFile);
  const authoredSemanticType = selectedQueries.types.authoredType(
    authoredTypeNode,
  );
  if (authoredSemanticType === undefined) {
    return resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const unionRefinement = selectCsharpAuthoredUnionRefinement(
    authored, authoredSemanticType, selectedType, selectedQueries,
    type => resolveCsharpUnionMemberCarrier(scope, authored, type, selectedQueries, state),
    host.structuralTypes.resolveTarget,
    host.typeDefinitions,
  );
  if (unionRefinement.kind !== "not-applicable") {
    return unionRefinement.kind === "resolved" ? unionRefinement.type : undefined;
  }
  const authoredSelection = selectedQueries.types.authoredSelection(
    authoredTypeNode,
    selectedType,
  );
  if (authoredSelection.kind === "authored-members") {
    const onlyAddedAbsence = authoredSelection.selectedNullishTypes.length > 0 &&
      sourceRefinementOnlyRemovesNullish(selectedType, authoredSemanticType, selectedQueries);
    const selectedMembers = authoredSelection.nodes.map((node) =>
      node === authoredTypeNode
        ? onlyAddedAbsence ? authored : reconcileCsharpSelectedTargetType(authored,
            resolveTypeWithState(selectedType, selectedSourceFile, nextState(state)),
            selectedQueries.types.relationship(authoredSemanticType, selectedType))
        : resolveNodeWithState(
            node,
            authoredSourceFile,
            nextState(state),
          )
    );
    const selectedNullishMembers = authoredSelection.selectedNullishTypes.map(
      (type) =>
        resolveTypeWithState(
          type,
          selectedSourceFile,
          nextState(state),
        ),
    );
    const selectedTargets = [
      ...selectedMembers,
      ...selectedNullishMembers,
    ];
    return selectedTargets.some((member) => member === undefined)
      ? undefined
      : combineCsharpTargetUnionMembers(
          selectedTargets as readonly TargetTypeRef[],
        );
  }
  if (authoredSelection.kind === "ambiguous") {
    return undefined;
  }
  return reconcileCsharpSelectedTargetType(
    authored,
    resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    ),
    selectedQueries.types.relationship(authoredSemanticType, selectedType),
  );
}


export function resolveSourceCallInstantiation(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  expectedTypeParameterIdentities?: readonly string[],
  callable?: CsharpSourceCallableContract,
):
  | {
      readonly arguments: readonly TargetTypeRef[];
      readonly substitutions: ReadonlyMap<string, TargetTypeRef>;
    }
  | undefined {
  const { host, inferSourceCallTargetTypeArguments, resolveAuthoredAndSelectedSourceType } = scope;
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const owner = callable?.sourceDeclaration ?? source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const projections = owner === undefined ? [] : host.representations.genericProjections?.(owner) ?? [];
  const queries = host.semantics(sourceFile);
  const parameterIdentities = selectedArguments.map(argument => {
    const parameter = resolveTypeParameter(argument.typeParameter, queries, host.ast);
    return parameter?.kind === "type-parameter" ? parameter.identity : undefined;
  });
  if (parameterIdentities.some(name => name === undefined)) return undefined;
  if (expectedTypeParameterIdentities?.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
    };
  }
  if (
    expectedTypeParameterIdentities !== undefined &&
    (
      selectedArguments.length + projections.length !== expectedTypeParameterIdentities.length ||
      parameterIdentities.some((name, index) =>
        name !== expectedTypeParameterIdentities[index]
      ) || projections.some((projection, index) => projection.identity !== expectedTypeParameterIdentities[selectedArguments.length + index])
    )
  ) {
    return undefined;
  }
  if (selectedArguments.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
    };
  }
  const inferredParameterIdentities = new Set(
    selectedArguments.flatMap((argument, index) => argument.explicitTypeNode === undefined ? [parameterIdentities[index]!] : []),
  );
  const inferredTargetArguments = callable === undefined ||
      inferredParameterIdentities.size === 0
    ? new Map<string, TargetTypeRef>()
    : inferSourceCallTargetTypeArguments(
        source,
        callable,
        sourceFile,
        inferredParameterIdentities,
        nextState(state),
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
        resolveAuthoredAndSelectedSourceType(
          undefined,
          sourceFile,
          selected.selectedType,
          sourceFile,
          nextState(state),
        )
      : resolveAuthoredAndSelectedSourceType(
          selected.explicitTypeNode,
          sourceFile,
          selected.selectedType,
          sourceFile,
          nextState(state),
        );
    if (targetArgument === undefined) {
      return undefined;
    }
    selectedParameters.add(selected.typeParameter);
    substitutions.set(parameterIdentity, targetArgument);
    arguments_.push(targetArgument);
  }
  if (owner !== undefined && projections.length > 0) {
    const results = resolveCsharpProjectionArguments(scope, owner, selectedArguments.map(argument => argument.selectedType), arguments_, state, projections);
    if (results === undefined) return undefined;
    for (const [index, result] of results.entries()) {
      substitutions.set(projections[index]!.identity, result);
      arguments_.push(result);
    }
  }
  return {
    arguments: Object.freeze(arguments_),
    substitutions,
  };
}
export function resolveSourceCallSelectedType(
  { host, resolveAuthoredAndSelectedSourceType, resolveNodeWithState, resolveSourceCallInstantiation, resolveSourceCallReceiverTargetType }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  declaration: Node | undefined,
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
  );
  if (instantiation === undefined) {
    return undefined;
  }
  const authoredSourceFile = host.ast.getSourceFile(authoredTypeNode) ??
    selectedSourceFile;
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
  callable: CsharpSourceCallableContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
    callable.methodTypeParameterIdentities,
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
  const receiverInstantiation = callable.receiverTypeOwner === undefined
    ? { kind: "not-project-member" as const }
    : host.projectTypes().instantiateDeclarationType(
        callable.receiverTypeOwner,
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
  callable: CsharpSourceCallableContract,
  sourceFile: SourceFile,
  parameterIdentities: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const inferred = new Map<string, TargetTypeRef>();
  for (const binding of source.sourceArgumentBindings) {
    const parameter = callable.parameters[binding.sourceParameterIndex]
      ?.targetParameter;
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
  if (csharpNumericLiteralValue(host.ast, literal) !== undefined || csharpBigIntLiteralValue(host.ast, literal) !== undefined) return [];
  if (host.ast.is.IsParenthesizedExpression(literal) || host.ast.is.IsSatisfiesExpression(literal)) {
    const inner = Node_Expression(host.ast, literal);
    return inner === undefined ? undefined : sourceArgumentInferencePairs(scope, inner, pattern, sourceFile, nextState(state));
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
  const shape = selectCsharpObjectLiteralUnionShape(pattern, elements.map(element => element!.evidence), host.structuralTypes.resolveTarget)
    ?? host.structuralTypes.resolveTarget(pattern);
  if (shape === undefined) return undefined;
  const pairs: { readonly pattern: TargetTypeRef; readonly actual: TargetTypeRef }[] = [];
  for (const element of elements) {
    const fields = shape.members.filter(member => member.sourceDeclarations?.some(declaration =>
      element!.evidence.sourceSelectedDeclarations.includes(declaration)) === true);
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
  { host, resolveSelectedReceiverTargetType, resolveSourceOwnedConstructionResult, resolveTypeWithState, resolveNodeWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
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


export function sourceCallCalleeDelegateSignature(
  { host, resolveSelectedValueWithState, resolveSourceCallInstantiation }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): ReturnType<typeof getCsharpDelegateSignature> {
  const carrier = resolveSelectedValueWithState(
    source.sourceCallee.expression,
    source.sourceCallee.type,
    sourceFile,
    nextState(state),
  );
  const receiver = source.sourceReceiver;
  const receiverCarrier = receiver === undefined ? undefined : resolveSelectedValueWithState(
    receiver.expression, receiver.type, sourceFile, nextState(state));
  const shape = receiverCarrier === undefined ? undefined : host.structuralTypes.resolveTarget(receiverCarrier);
  const member = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape,
    [source.sourceCallee.selectedDeclaration, source.sourceCallee.declaration, source.sourceCallee.selectedSymbol, source.sourceCallee.symbol]
      .filter(subject => subject !== undefined));
  const selected = member?.kind === "resolved" ? member.member.type : carrier;
  const contract = getCsharpGenericMethodValue(selected)?.contract ?? selected;
  if (getCsharpDelegateSignature(contract) === undefined) return undefined;
  const instantiation = resolveSourceCallInstantiation(source, sourceFile, nextState(state));
  return contract === undefined || instantiation === undefined ? undefined
    : getCsharpDelegateSignature(substituteTargetTypeParameters(contract, instantiation.substitutions));
}


export function sourceCallableTypeParametersMatch(
  { host }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
): boolean {
  if (callable.methodTypeParameterIdentities.length === 0) {
    return true;
  }
  const selected = source.sourceSelectedMethodTypeArguments ?? [];
  const file = host.ast.getSourceFile(source.sourceCallee.expression);
  if (file === undefined) return false;
  const queries = host.semantics(file);
  const projections = callable.sourceDeclaration === undefined ? []
    : host.representations.genericProjections?.(callable.sourceDeclaration) ?? [];
  return selected.length + projections.length === callable.methodTypeParameterIdentities.length &&
    projections.every((projection, index) => projection.identity === callable.methodTypeParameterIdentities[selected.length + index]) &&
    selected.every((argument, index) => {
      const parameter = resolveTypeParameter(argument.typeParameter, queries, host.ast);
      return parameter?.kind === "type-parameter" && parameter.identity === callable.methodTypeParameterIdentities[index];
    });
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
  return referenced !== undefined &&
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
