import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import { classifyCsharpSourceProfileDeclaration, classifyCsharpSourceProfileType, selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";

import { csharpSourceTypeArgumentNodes } from "../../../../target-model/syntax/type-arguments.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";

import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpNeverTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { nextState } from "./state.js";
import { sourceFactSubjectsForNode, definedValues, resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
import { sourceTransformedTypeFactEvidenceNodes, sourceTupleElementTypeEvidenceNodes, sourceTypeSyntaxIsCompositional, sourceTypeSyntaxRoot, sourceIntegerInduction, sourceCallableValueParameters } from "@tsonic/target-api/source";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefKey, targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { reconcileCsharpSelectedTargetType, retainCsharpBroadValueCarrier } from "../../../../policy/types/resolution/selected-type-evidence.js";
import { selectCsharpAuthoredUnionRefinement } from "./source-union-refinement.js";
import { csharpBoundSourceType, csharpSourceBindings, csharpSourceTemplateState } from "./type-bindings.js";
import { csharpConditionalDeclaration, resolveCsharpConditionalApplication } from "./conditional-types.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { bindCsharpSourceTypeArguments } from "./generic-arguments.js";
import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { csharpExceptionTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { namedTargetTypeImplicitlyAccepts } from "../../../../policy/conversions/carriers.js";
import { sourceOperatorFromKindName } from "../../../../target-model/syntax/operators.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function resolveTypeReferenceNode(
  { host, resolveCheckerTransformedSourceType, resolveCompositionalSourceTypeAlias, resolveDirectSourceFacts, resolveNodeWithState, resolveProjectSourceType, resolveProviderType, resolveSourceProfileType, resolveStandardSourceTypeTransformation, resolveTypeWithState, targetPreservesAuthoredSourcePrimitiveFacts }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const reference = host.ast.as.AsTypeReferenceNode(node)!;
  const typeName = reference.TypeName;
  if (typeName === undefined) {
    return undefined;
  }
  const semanticType = queries.types.authoredType(node);
  const bound = semanticType === undefined ? undefined : csharpBoundSourceType(semanticType, queries, state);
  if (bound !== undefined) return bound.targetType;
  const subjects = [
    ...sourceFactSubjectsForNode(typeName, host.navigation, node),
    ...(semanticType === undefined
      ? []
      : queries.facts.typeSubjects(semanticType)),
  ];
  const direct = resolveDirectSourceFacts(subjects, queries.sourceFile, state);
  if (direct !== undefined) {
    return direct;
  }
  const standardTransformation = semanticType === undefined
    ? undefined
    : queries.types.standardTransformation(node, semanticType);
  if (
    standardTransformation !== undefined &&
    semanticType !== undefined &&
    (standardTransformation.kind !== "structural" || queries.types.indexInfos(semanticType).length === 0)
  ) {
    return resolveStandardSourceTypeTransformation(
      standardTransformation,
      queries,
      state,
      node,
      semanticType,
    );
  }
  const typeArguments = csharpSourceTypeArgumentNodes(host.ast, node).map((argument) =>
    resolveNodeWithState(argument, queries.sourceFile, nextState(semanticType !== undefined &&
      queries.types.isArrayLike(semanticType) && !queries.types.isTuple(semanticType)
      ? csharpSourceStorageComponentContext(host, state, { kind: "array-element" }) : state))
  );
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const projectType = resolveProjectSourceType(
    typeName,
    queries.sourceFile,
    state,
    typeArguments as readonly TargetTypeRef[],
    csharpSourceTypeArgumentNodes(host.ast, node).map(argument => {
      const selected = queries.types.authoredType(argument);
      return selected === undefined ? undefined : csharpBoundSourceType(selected, queries, state)?.sourceType ?? selected;
    }),
  );
  if (projectType !== undefined) {
    return projectType;
  }
  const providerType = resolveProviderType(
    subjects,
    typeArguments as readonly TargetTypeRef[],
  );
  if (providerType !== undefined) {
    return providerType;
  }
  const selectedDeclaration = host.navigation.sourceReferenceFor(typeName)?.declaration;
  const profileIdentity = selectedDeclaration === undefined
    ? semanticType === undefined ? undefined : classifyCsharpSourceProfileType(semanticType, queries, host.ast)
    : classifyCsharpSourceProfileDeclaration(selectedDeclaration, host.ast);
  if (profileIdentity !== undefined) {
    return resolveSourceProfileType(
        profileIdentity,
        typeArguments as readonly TargetTypeRef[],
      );
  }
  if (
    standardTransformation !== undefined &&
    semanticType !== undefined
  ) {
    return resolveStandardSourceTypeTransformation(
      standardTransformation,
      queries,
      state,
      node,
      semanticType,
    );
  }
  const sourceAlias = resolveCompositionalSourceTypeAlias(
    typeName,
    typeArguments as readonly TargetTypeRef[],
    semanticType,
    queries,
    state,
    csharpSourceTypeArgumentNodes(host.ast, node).map(argument => {
      const selected = queries.types.authoredType(argument);
      return selected === undefined ? undefined : csharpBoundSourceType(selected, queries, state)?.sourceType ?? selected;
    }),
  );
  if (sourceAlias.kind === "resolved") {
    return sourceAlias.type;
  }
  if (sourceAlias.kind === "rejected") {
    return { kind: "opaque", id: "source-alias-representation-unavailable" };
  }
  const transformedTarget = sourceAlias.kind === "checker-transformed-alias" &&
      semanticType !== undefined
    ? resolveCheckerTransformedSourceType(
        node,
        semanticType,
        queries,
        state,
      )
    : undefined;
  if (transformedTarget !== undefined) {
    return transformedTarget;
  }
  const semanticTarget = resolveTypeWithState(
    semanticType,
    queries.sourceFile,
    nextState(state),
  );
  return sourceAlias.kind === "checker-transformed-alias" &&
      semanticTarget !== undefined &&
      !targetPreservesAuthoredSourcePrimitiveFacts(
        node,
        semanticTarget,
        queries,
      )
    ? { kind: "opaque", id: "source-fact-dependent-type-transform" }
    : semanticTarget;
}

export function resolveCheckerTransformedSourceType(
  { host, resolveCallableType, resolveEvidenceNodesToCommonTarget, resolveStandardSourceTypeTransformation, resolveTypeWithState }: CsharpTypeResolutionScope,
  authoredRoot: Node,
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const standard = queries.types.standardTransformation(
    authoredRoot,
    selectedType,
  );
  if (standard !== undefined) {
    return resolveStandardSourceTypeTransformation(
      standard,
      queries,
      state,
      authoredRoot,
      selectedType,
    );
  }
  const direct = resolveEvidenceNodesToCommonTarget(
    sourceTransformedTypeFactEvidenceNodes(
      host.ast,
      queries,
      authoredRoot,
      selectedType,
    ),
    selectedType,
    queries,
    state,
  );
  if (direct !== undefined) {
    return direct;
  }
  if (queries.types.isTuple(selectedType)) {
    const infos = queries.types.tupleElementInfos(selectedType);
    const elements = infos.map((element, index) => {
      const elementState = csharpSourceStorageComponentContext(host, state, { kind: "tuple-element", index });
      const evidence = [
        ...sourceTupleElementTypeEvidenceNodes(host.ast, queries, element),
        ...sourceTransformedTypeFactEvidenceNodes(
          host.ast,
          queries,
          authoredRoot,
          element.type,
        ),
      ];
      return resolveEvidenceNodesToCommonTarget(
        evidence,
        element.type,
        queries,
        elementState,
      ) ?? resolveTypeWithState(
        element.type,
        queries.sourceFile,
        nextState(elementState),
      );
    });
    return infos.length === 0 || elements.some((element) => element === undefined)
      ? undefined
      : {
          kind: "tuple",
          elements: elements as readonly TargetTypeRef[],
        };
  }
  const callable = resolveCallableType(selectedType, queries, state);
  if (callable !== undefined) {
    return callable;
  }
  return host.structuralTypes.resolveType(
    selectedType,
    queries.sourceFile,
    nextState(state),
    authoredRoot,
  );
}

export function resolveStandardSourceTypeTransformation(
  { host, resolveCallableEvidence, resolveSignatureParameterEvidence, resolveSignatureParameterListTarget, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  transformation: NonNullable<
    ReturnType<SourceFileSemantics["types"]["standardTransformation"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node,
  selectedType: Type,
): TargetTypeRef | undefined {
  if (transformation.kind === "unresolved") {
    return undefined;
  }
  if (transformation.kind === "non-nullish" || transformation.kind === "component") {
    if (transformation.kind === "non-nullish" && queries.types.isNever(selectedType)) return csharpNeverTargetType();
    const component = transformation.component;
    let selectedQueries = queries;
    if (component.authoredTypeNode !== undefined && component.declaration === undefined) {
      const sourceFile = host.ast.getSourceFile(authoredRoot);
      if (sourceFile === undefined || !host.hasSemantics(sourceFile)) return undefined;
      selectedQueries = host.semanticsFor(authoredRoot);
    }
    const input = resolveSourceTypeComponentEvidence(component, selectedQueries, state);
    return transformation.kind === "non-nullish" ? getCsharpNullableElementTargetType(input) ?? input : input;
  }
  if (transformation.kind === "parameter-list") {
    const elements = transformation.parameters.map((element) =>
      resolveSignatureParameterEvidence(element, queries, state, "parameter-list")
    );
    return elements.some((element) => element === undefined)
      ? undefined
      : resolveSignatureParameterListTarget(
          transformation.parameters,
          elements as readonly TargetTypeRef[],
        );
  }
  if (transformation.kind === "structural") {
    return host.structuralTypes.resolveType(
      selectedType,
      queries.sourceFile,
      nextState(state),
      authoredRoot,
    );
  }
  return resolveCallableEvidence(
    transformation.callable,
    queries,
    state,
  );
}

export function resolveSignatureParameterListTarget(
  { host }: CsharpTypeResolutionScope,
  parameters: SourceCallableTypeEvidence["parameters"],
  elements: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const restIndexes = parameters.flatMap((parameter, index) => parameter.parameterKind === "rest" ? [index] : []);
  return selectCsharpParameterListCarrier(elements, restIndexes, selectedCsharpSourceProfileOwner(host.target) === "js");
}

export function resolveEvidenceNodesToCommonTarget(
  { host, resolveAuthoredAndSelectedSourceType }: CsharpTypeResolutionScope,
  nodes: readonly Node[],
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (nodes.length === 0) {
    return undefined;
  }
  const targets = [...new Set(nodes)].map((node) =>
    resolveAuthoredAndSelectedSourceType(
      node,
      host.ast.getSourceFile(node) ?? queries.sourceFile,
      selectedType,
      queries.sourceFile,
      nextState(state),
    )
  );
  if (targets.some((target) => target === undefined)) {
    return undefined;
  }
  const first = targets[0]!;
  return targets.every((target) =>
      target !== undefined && targetTypeRefEquals(first, target)
    )
    ? first
    : undefined;
}

export function resolveCompositionalSourceTypeAlias(
  scope: CsharpTypeResolutionScope,
  typeName: Node,
  typeArguments: readonly TargetTypeRef[],
  selectedType: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  sourceArguments?: readonly (Type | undefined)[],
):
  | { readonly kind: "not-alias" }
  | { readonly kind: "checker-transformed-alias" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected" } {
  const { host, resolveCheckerTransformedSourceType, resolveNodeWithState } = scope;
  const reference = host.navigation.sourceReferenceFor(typeName);
  if (
    reference === undefined ||
    !host.ast.is.IsTypeAliasDeclaration(reference.declaration)
  ) {
    return { kind: "not-alias" };
  }
  const declaration = host.ast.as.AsTypeAliasDeclaration(
    reference.declaration,
  );
  const target = declaration?.Type;
  const parameters = host.ast.typeParameters(reference.declaration);
  if (target === undefined || parameters.length !== typeArguments.length) {
    return { kind: "rejected" };
  }
  const boundState = sourceArguments === undefined ? state
    : sourceArguments.some(argument => argument === undefined) ? undefined
    : csharpSourceBindings(parameters as readonly Node[], sourceArguments as readonly Type[], typeArguments, state);
  if (boundState === undefined) return { kind: "rejected" };
  const application = sourceArguments === undefined ? undefined
    : queries.types.instantiateAlias(reference.declaration, sourceArguments as readonly Type[]);
  if (application?.kind === "conditional" && csharpConditionalDeclaration(scope, application) !== undefined) {
    const authoredRoot = host.ast.parent(typeName);
    const type = resolveCsharpConditionalApplication(scope, application, typeArguments, queries, boundState,
      authoredRoot !== undefined && host.ast.is.IsTypeReferenceNode(authoredRoot) ? authoredRoot : target);
    return type === undefined ? { kind: "rejected" } : { kind: "resolved", type };
  }
  const substitutions = new Map<string, TargetTypeRef>();
  for (const [index, declaration] of parameters.entries()) {
    const parameter = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, host.ast);
    const argument = typeArguments[index];
    if (parameter === undefined || argument === undefined || substitutions.has(parameter.identity)) return { kind: "rejected" };
    substitutions.set(parameter.identity, argument);
  }
  const syntaxRoot = sourceTypeSyntaxRoot(host.ast, target);
  if (selectedType !== undefined && host.ast.is.IsUnionTypeNode(syntaxRoot)) {
    const templateState = csharpSourceTemplateState(parameters, state);
    const definitionType = host.semantics(reference.sourceFile).types.authoredType(target);
    const structural = definitionType === undefined ? { kind: "not-applicable" as const }
      : host.structuralTypes.resolveUnion(definitionType, reference.sourceFile, templateState);
    if (structural.kind === "rejected") return structural;
    if (structural.kind === "resolved") {
      return { kind: "resolved", type: substituteTargetTypeParameters(structural.type, substitutions) };
    }
    const template = resolveNodeWithState(target, reference.sourceFile, nextState(templateState));
    return template === undefined ? { kind: "rejected" }
      : { kind: "resolved", type: substituteTargetTypeParameters(template, substitutions) };
  }
  const resolved = target === undefined
    ? undefined
    : sourceTypeSyntaxIsCompositional(host.ast, target) || host.ast.is.IsTypeQueryNode(target)
      ? resolveNodeWithState(
          target,
          reference.sourceFile,
          nextState(boundState),
        )
      : selectedType === undefined
        ? undefined
        : resolveCheckerTransformedSourceType(
            target,
            selectedType,
            queries,
            nextState(boundState),
          );
  if (resolved === undefined) {
    return { kind: "checker-transformed-alias" };
  }
  return {
    kind: "resolved",
    type: sourceArguments === undefined ? substituteTargetTypeParameters(resolved, substitutions) : resolved,
  };
}

export function targetPreservesAuthoredSourcePrimitiveFacts(
  { collectTargetSourcePrimitiveNames, host }: CsharpTypeResolutionScope,
  node: Node,
  target: TargetTypeRef,
  queries: SourceFileSemantics,
): boolean {
  const required = new Set(definedValues(
    queries.facts.authoredTypeSubjects(node)
      .map((subject) =>
        host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey)?.kind
      ),
  ));
  if (required.size === 0) {
    return true;
  }
  const preserved = new Set<string>();
  collectTargetSourcePrimitiveNames(target, preserved, new Set());
  return [...required].every((kind) => preserved.has(kind));
}

export function collectTargetSourcePrimitiveNames(
  { collectTargetSourcePrimitiveNames, host }: CsharpTypeResolutionScope,
  target: TargetTypeRef,
  names: Set<string>,
  visited: Set<string> = new Set(),
): void {
  const key = targetTypeRefKey(target);
  if (visited.has(key)) {
    return;
  }
  visited.add(key);
  if (target.kind === "source-primitive") {
    names.add(target.name);
  }
  for (const component of host.targetTypeComponents(target)) {
    collectTargetSourcePrimitiveNames(component, names, visited);
  }
}

export function resolveCsharpNativeParameterCarrier(
  scope: CsharpTypeResolutionScope,
  parameter: Node,
  type: TargetTypeRef | undefined,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined || !scope.host.ast.is.IsParameterDeclaration(parameter)) return type;
  const declaration = scope.host.ast.parent(parameter);
  if (declaration === undefined) return undefined;
  const selected = scope.host.objectShapes.resolveNativeParameter(declaration, parameter, type);
  if (selected.kind === "resolved") return selected.type;
  state.rejectNativeResolution?.(selected);
  return undefined;
}

export function selectCsharpContextualParameterCarrier(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): { readonly kind: "not-applicable" } | { readonly kind: "unresolved" } |
  { readonly kind: "resolved"; readonly type: TargetTypeRef } {
  const { host } = scope;
  if (!host.ast.is.IsParameterDeclaration(declaration)) return { kind: "not-applicable" };
  const syntax = scope.sourceValueDeclarationSyntax(declaration);
  if (syntax.type !== undefined || syntax.initializer !== undefined) return { kind: "not-applicable" };
  const owner = host.ast.parent(declaration);
  if (owner === undefined || !host.ast.is.IsArrowFunction(owner) && !host.ast.is.IsFunctionExpression(owner)) {
    return { kind: "not-applicable" };
  }
  const parameters = sourceCallableValueParameters(host.ast, owner, queries);
  const index = parameters?.indexOf(declaration) ?? -1;
  const contextual = queries.types.contextualValueSelection(owner);
  if (contextual.kind === "ambiguous") return { kind: "unresolved" };
  if (contextual.kind !== "selected") return { kind: "not-applicable" };
  const callable = queries.types.callable(contextual.component.selectedType);
  const restBinding = host.ast.as.AsParameterDeclaration(declaration)?.DotDotDotToken !== undefined;
  if (index < 0 || callable === undefined) return { kind: "not-applicable" };
  let parameterState = bindCsharpSourceTypeArguments(scope, contextual.component.selectedType, queries, nextState(state));
  const ownParameters = host.ast.typeParameters(owner);
  if (ownParameters.length !== 0) {
    const contextualParameters = callable?.result.declaration === undefined ? []
      : host.ast.typeParameters(callable.result.declaration);
    const ownSources = ownParameters.map(parameter => parameter === undefined ? undefined
      : queries.declarations.declaredType(parameter));
    const ownTargets = ownParameters.map(parameter => parameter === undefined ? undefined
      : csharpSourceTypeParameter(parameter, host.ast));
    if (parameterState === undefined || contextualParameters.length !== ownParameters.length ||
      contextualParameters.some(parameter => parameter === undefined) ||
      ownSources.some(type => type === undefined) || ownTargets.some(type => type === undefined)) return { kind: "unresolved" };
    parameterState = csharpSourceBindings(contextualParameters as readonly Node[], ownSources as readonly Type[],
      ownTargets as readonly TargetTypeRef[], parameterState);
  }
  const nativeContract = parameterState === undefined ? undefined : scope.resolveCallableEvidence(callable, queries, parameterState);
  const signature = getCsharpCallableValueSignature(nativeContract);
  const restIndex = signature?.restParameterIndex;
  const nativeParameter = signature?.parameters[restIndex !== undefined && index >= restIndex ? restIndex : index];
  const native = signature === undefined ? undefined : restBinding
    ? restIndex === undefined ? Object.freeze({ kind: "tuple" as const, elements: Object.freeze(signature.parameters.slice(index)) })
      : index === restIndex ? nativeParameter : undefined
    : restIndex !== undefined && index >= restIndex && nativeParameter !== undefined
      ? csharpTargetParameterValueType({ name: "", type: nativeParameter, passingMode: "by-value", paramsArray: true }, "value")
      : nativeParameter;
  return native === undefined ? { kind: "unresolved" } : { kind: "resolved", type: native };
}

export function selectCsharpErrorObservationView(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  carrier: TargetTypeRef | undefined,
  selectedType?: Type,
): TargetTypeRef | undefined {
  if (carrier?.kind !== "target-named" || !scope.host.ast.is.IsIdentifier(node)) return carrier;
  const selected = selectedType ?? queries.types.expressionType(node);
  const identity = selected === undefined ? undefined : classifyCsharpSourceProfileType(
    queries.types.nonNullableType(selected) ?? selected, queries, scope.host.ast);
  if (identity?.kind !== "error" || !identity.baseException) return carrier;
  const { host } = scope;
  let operand = node;
  let parent = host.ast.parent(operand);
  while (parent !== undefined && host.ast.is.IsParenthesizedExpression(parent)) {
    operand = parent;
    parent = host.ast.parent(operand);
  }
  if (parent === undefined) return carrier;
  let observation = false;
  if (host.ast.is.IsPropertyAccessExpression(parent) || host.ast.is.IsElementAccessExpression(parent)) {
    const field = host.errorDeclarations.fieldFor(parent);
    if (field.kind === "unresolved") return failTargetAnalysisInvariant("tsonic-csharp", field.reason, parent);
    observation = field.kind === "resolved" && field.value.receiver.node === operand && field.value.accessMode === "read";
  } else if (host.ast.is.IsBinaryExpression(parent)) {
    const operator = sourceOperatorFromKindName(host.ast.operatorKindName(parent));
    const binary = host.ast.as.AsBinaryExpression(parent);
    const other = binary?.Left === operand ? binary.Right : binary?.Right === operand ? binary.Left : undefined;
    const otherType = other === undefined ? undefined : queries.types.expressionType(other);
    const otherIdentity = otherType === undefined ? undefined : classifyCsharpSourceProfileType(otherType, queries, host.ast);
    observation = (operator === "===" || operator === "!==") && otherIdentity?.kind === "error";
  }
  if (!observation) return carrier;
  const exception = host.providers.publishNativeIdentities(csharpExceptionTargetType());
  if (exception.kind !== "resolved") return failTargetAnalysisInvariant("tsonic-csharp",
    "A checked Error observation requires its exact native Exception identity.", node);
  const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (!namedTargetTypeImplicitlyAccepts({ providers: host.providers, projectTypes: host.projectTypes(),
    typeDefinitions: host.typeDefinitions, objectShapes: host.objectShapes }, present, exception.value, new Set()))
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A checked Error observation requires its selected carrier's native reference relation to Exception.", node);
  return getCsharpNullableElementTargetType(carrier) === undefined ? exception.value : csharpNullableTargetType(exception.value);
}

export function resolveSourceValueDeclaration(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): TargetTypeRef | undefined {
  const { host, resolveAuthoredAndSelectedSourceType, resolveDirectSourceFacts, resolveNodeWithState, resolveSelectedExpressionType, resolveTypeWithState, sourceValueDeclaration, sourceValueDeclarationSyntax } = scope;
  const reference = host.navigation.referenceFor(node);
  const declaration = sourceValueDeclaration(node, reference?.declaration);
  if (declaration === undefined) {
    return undefined;
  }
  const sourceFile = host.ast.getSourceFile(declaration) ?? queries.sourceFile;
  const syntax = sourceValueDeclarationSyntax(declaration);
  const formal = host.ast.is.IsParameterDeclaration(declaration)
    ? host.representations.sourceParameter(declaration) : undefined;
  if (formal !== undefined) {
    const source = host.semantics(sourceFile).declarations.declaredValueType(declaration);
    const selected = selectedType ?? queries.types.expressionType(node);
    if (source === undefined || selected === undefined) return formal.bodyType;
    if (queries.types.isIdentical(source, selected)) return formal.bodyType;
    const present = queries.types.nonNullableType(source);
    if (present !== undefined && queries.types.isIdentical(present, selected))
      return getCsharpNullableElementTargetType(formal.bodyType) ?? formal.bodyType;
    const refined = selectCsharpAuthoredUnionRefinement(formal.bodyType, source, selected, queries,
      type => resolveCsharpUnionMemberCarrier(scope, formal.bodyType, type, queries, state),
      host.structuralTypes.resolveTarget, host.typeDefinitions);
    if (refined.kind !== "not-applicable") return refined.kind === "resolved" ? refined.type : undefined;
    return reconcileCsharpSelectedTargetType(formal.bodyType, resolveTypeWithState(selected, queries.sourceFile, nextState(state)),
      queries.types.relationship(source, selected), queries.types.isNonPrimitive(selected));
  }
  if (syntax.type !== undefined) {
    const resolved = resolveAuthoredAndSelectedSourceType(
      syntax.type,
      sourceFile,
      selectedType ?? queries.types.expressionType(node),
      queries.sourceFile,
      state,
    );
    if (resolved !== undefined) {
      return resolveCsharpNativeParameterCarrier(scope, declaration, resolved, state);
    }
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    return host.bindingProjection(declaration, sourceFile)?.bindingCarrier;
  }
  const declarationQueries = host.semantics(sourceFile);
  const induction = sourceIntegerInduction(declaration, host.ast, host.navigation, {
    sourceFacts: host.sourceFacts, semanticsFor: host.semanticsFor,
  });
  if (induction !== undefined) {
    const bound = resolveNodeWithState(induction.bound, sourceFile, nextState(state));
    if (bound?.kind === "source-primitive" &&
      ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "native-int", "native-uint"].includes(bound.name)) {
      return bound;
    }
  }
  const declaredSourceType = declarationQueries.declarations.declaredValueType(declaration);
  const declaredTarget = resolveTypeWithState(
    declaredSourceType,
    sourceFile,
    nextState(state),
  );
  if (syntax.initializer === undefined) {
    const selectedSource = selectedType ?? queries.types.expressionType(node);
    const selected = resolveTypeWithState(
      selectedSource,
      queries.sourceFile,
      nextState(state),
    );
    const contextual = selectCsharpContextualParameterCarrier(scope, declaration, declarationQueries, state);
    if (contextual.kind === "unresolved") return undefined;
    if (contextual.kind === "resolved") {
      const native = resolveCsharpNativeParameterCarrier(scope, declaration, contextual.type, state);
      if (native === undefined) return undefined;
      const declaredSource = declarationQueries.declarations.declaredValueType(declaration);
      if (declaredSource === undefined || selectedSource === undefined) return native;
      const refinement = selectCsharpAuthoredUnionRefinement(native, declaredSource, selectedSource, queries,
        type => resolveCsharpUnionMemberCarrier(scope, native, type, queries, state),
        host.structuralTypes.resolveTarget, host.typeDefinitions);
      if (refinement.kind !== "not-applicable") return refinement.kind === "resolved" ? refinement.type : undefined;
      if (native.kind === "source-primitive") return native;
      return reconcileCsharpSelectedTargetType(native, selected, queries.types.relationship(declaredSource, selectedSource),
        queries.types.isNonPrimitive(selectedSource));
    }
    return resolveCsharpNativeParameterCarrier(scope, declaration, retainCsharpBroadValueCarrier(declaredTarget, selected,
      selectedSource !== undefined && queries.types.isNonPrimitive(selectedSource)) ?? selected ?? declaredTarget, state);
  }
  const arrayInitializer = host.ast.is.IsArrayLiteralExpression(syntax.initializer);
  const declarationKind = host.ast.variableDeclarationKind(declaration);
  const mutableVariable = syntax.type === undefined && host.ast.is.IsVariableDeclaration(declaration) &&
    (declarationKind === "let" || declarationKind === "var");
  const initializerSourceType = mutableVariable ? declarationQueries.types.expressionType(syntax.initializer) : undefined;
  const literalBaseType = initializerSourceType === undefined ? undefined
    : declarationQueries.types.literalBaseType(initializerSourceType);
  const widenedInitializer = mutableVariable &&
    declaredTarget !== undefined && declaredSourceType !== undefined && initializerSourceType !== undefined &&
    literalBaseType !== undefined && !declarationQueries.types.isIdentical(initializerSourceType, literalBaseType) &&
    declarationQueries.types.isIdentical(declaredSourceType, literalBaseType) &&
    scope.targetPreservesAuthoredSourcePrimitiveFacts(syntax.initializer, declaredTarget, declarationQueries);
  const declaredCallable = mutableVariable && getCsharpCallableValueSignature(
    getCsharpNullableElementTargetType(declaredTarget) ?? declaredTarget,
  ) !== undefined;
  const initializerTarget = arrayInitializer
    ? resolveNodeWithState(syntax.initializer, sourceFile, nextState(state))
    : widenedInitializer ? declaredTarget
    : resolveDirectSourceFacts([syntax.initializer], sourceFile, nextState(state)) ??
      resolveSelectedExpressionType(syntax.initializer, declarationQueries, nextState(state)) ??
      (declaredTarget !== undefined && (declaredCallable || !mutableVariable && declarationKind !== "const")
        ? declaredTarget
        : resolveNodeWithState(syntax.initializer, sourceFile, nextState(state)));
  if (initializerTarget === undefined) {
    return arrayInitializer ? undefined : declaredTarget;
  }
  if (node === declaration) {
    return initializerTarget;
  }
  const declaredType = queries.declarations.declaredValueType(declaration);
  const selectedValueType = selectedType ?? queries.types.expressionType(node);
  if (declaredType === undefined || selectedValueType === undefined) {
    return initializerTarget;
  }
  const refinement = queries.types.refinement(
    declaredType,
    selectedValueType,
  );
  const selectedUnion = selectCsharpAuthoredUnionRefinement(initializerTarget, declaredType, selectedValueType,
    queries, type => resolveCsharpUnionMemberCarrier(scope, initializerTarget, type, queries, state),
    host.structuralTypes.resolveTarget, host.typeDefinitions);
  if (selectedUnion.kind !== "not-applicable") return selectedUnion.kind === "resolved" ? selectedUnion.type : undefined;
  if (refinement.kind === "ambiguous") {
    return undefined;
  }
  if (refinement.kind === "unrelated") {
    const present = getCsharpNullableElementTargetType(initializerTarget) ?? initializerTarget;
    const selectedMembers = queries.types.isUnion(selectedValueType)
      ? queries.types.unionOrIntersectionTypes(selectedValueType) : [selectedValueType];
    if (syntax.type === undefined && present.kind === "target-named" &&
      (present as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "enum" &&
      selectedMembers.length > 0 && selectedMembers.every(member =>
        queries.types.isNullish(member) || queries.types.isNumberLike(member))) {
      return selectedMembers.some(member => queries.types.isNullish(member)) ? initializerTarget : present;
    }
    return reconcileCsharpSelectedTargetType(
      initializerTarget,
      resolveTypeWithState(selectedValueType, queries.sourceFile, nextState(state)),
      queries.types.relationship(declaredType, selectedValueType),
      queries.types.isNonPrimitive(selectedValueType),
    );
  }
  if (
    refinement.kind === "members" &&
    refinement.types.length > 0 &&
    refinement.types.every((member) => !queries.types.isNullish(member))
  ) {
    return getCsharpNullableElementTargetType(initializerTarget) ??
      initializerTarget;
  }
  return initializerTarget;
}
