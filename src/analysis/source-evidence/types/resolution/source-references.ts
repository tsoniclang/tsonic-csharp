import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";

import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { nextState } from "./state.js";
import { definedValues, resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
import { sourceTransformedTypeFactEvidenceNodes, sourceTupleElementTypeEvidenceNodes, sourceTypeSyntaxIsCompositional, sourceTypeSyntaxRoot, sourceIntegerInduction } from "@tsonic/target-api/source";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefKey, targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { reconcileCsharpSelectedTargetType, retainCsharpBroadValueCarrier } from "../../../../policy/types/resolution/selected-type-evidence.js";
import { selectCsharpAuthoredUnionRefinement } from "./source-union-refinement.js";
import { completeCsharpBoundSourceType, csharpBoundSourceType, csharpSourceBindings, csharpSourceTemplateState } from "./type-bindings.js";
import { csharpConditionalDeclaration, resolveCsharpConditionalApplication } from "./conditional-types.js";
import { resolveStructuralTypeWithState } from "./root-sources.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { formCsharpTypeReferenceSource, type CsharpTypeReferenceSource } from "./type-reference-source.js";
import { resolveFormedCsharpProjectReference } from "./project-types.js";
import { resolveSelectedExpressionResult } from "./expressions.js";
import { resolveDirectSourceFacts } from "./semantic-types.js";
import { formCsharpNativeParameterSource, resolveFormedCsharpNativeParameterCarrier } from "./native-parameter-source.js";
import { formCsharpContextualParameterSource, resolveFormedCsharpContextualParameterCarrier,
  type CsharpContextualParameterSelection } from "./contextual-parameter-source.js";
import { formCsharpStandardTypeTransformationSource, resolveFormedCsharpStandardTypeTransformation } from "./standard-transformation-source.js";

export function resolveTypeReferenceNode(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpTypeReferenceNode(scope, formCsharpTypeReferenceSource(scope, node, queries, state));
}

export function resolveFormedCsharpTypeReferenceNode(
  scope: CsharpTypeResolutionScope,
  source: CsharpTypeReferenceSource,
): TargetTypeRef | undefined {
  const { resolveCheckerTransformedSourceType, resolveCompositionalSourceTypeAlias, resolveFormedDirectSourceFacts, resolveNodeWithState, resolveProviderType, resolveSourceProfileType, resolveFormedStandardSourceTypeTransformation, resolveTypeWithState, targetPreservesAuthoredSourcePrimitiveFacts } = scope;
  if (source.kind === "missing-name") return undefined;
  const { node, typeName, semanticType, queries, state, subjects } = source;
  const bound = completeCsharpBoundSourceType(source.binding, state);
  if (bound !== undefined) return bound.targetType;
  const direct = resolveFormedDirectSourceFacts(source.direct);
  if (direct !== undefined) {
    return direct;
  }
  const standardTransformation = source.transformation;
  if (standardTransformation === undefined ? source.transformationSource !== undefined
    : source.transformationSource === undefined || source.transformationSource.transformation !== standardTransformation ||
      source.transformationSource.queries !== queries || source.transformationSource.state !== state ||
      source.transformationSource.authoredRoot !== node || source.transformationSource.selectedType !== semanticType) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A type reference requires its exact checked transformation Source.", node);
  }
  if (source.kind === "transformation") {
    return resolveFormedStandardSourceTypeTransformation(source.transformationSource);
  }
  const typeArguments = source.arguments.map(argument =>
    resolveNodeWithState(argument.node, queries.sourceFile, argument.state));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const sourceArguments = source.arguments.map(argument => argument.sourceType === undefined ? undefined
    : completeCsharpBoundSourceType(argument.binding, state)?.sourceType ?? argument.sourceType);
  const projectType = source.project === undefined ? undefined : resolveFormedCsharpProjectReference(
    scope,
    source.project,
    typeArguments as readonly TargetTypeRef[],
    sourceArguments,
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
  const profileIdentity = source.profileIdentity;
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
    return resolveFormedStandardSourceTypeTransformation(source.transformationSource!);
  }
  const sourceAlias = resolveCompositionalSourceTypeAlias(
    typeName,
    typeArguments as readonly TargetTypeRef[],
    semanticType,
    queries,
    state,
    sourceArguments,
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
  scope: CsharpTypeResolutionScope,
  authoredRoot: Node,
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveCallableType, resolveEvidenceNodesToCommonTarget, resolveTypeWithState } = scope;
  const standard = queries.types.standardTransformation(
    authoredRoot,
    selectedType,
  );
  if (standard !== undefined) {
    return resolveStandardSourceTypeTransformation(
      scope,
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
  return resolveStructuralTypeWithState(scope,
    selectedType,
    queries.sourceFile,
    nextState(state),
    authoredRoot,
  );
}

export function resolveStandardSourceTypeTransformation(
  scope: CsharpTypeResolutionScope,
  transformation: NonNullable<
    ReturnType<SourceFileSemantics["types"]["standardTransformation"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node,
  selectedType: Type,
): TargetTypeRef | undefined {
  return resolveFormedCsharpStandardTypeTransformation(scope,
    formCsharpStandardTypeTransformationSource(scope, transformation, queries, state, authoredRoot, selectedType));
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
  if (type === undefined) return undefined;
  return resolveFormedCsharpNativeParameterCarrier(scope, formCsharpNativeParameterSource(scope.host.ast, parameter), type, state);
}

export function selectCsharpContextualParameterCarrier(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpContextualParameterSelection {
  return resolveFormedCsharpContextualParameterCarrier(scope,
    formCsharpContextualParameterSource(scope, declaration, queries), state);
}

export function resolveSourceValueDeclaration(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): TargetTypeRef | undefined {
  return scope.resolveSourceValueResult(node, queries, state, selectedType)?.selectedType;
}

export function resolveSourceValueResult(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): CsharpSourceCallResult | undefined {
  const { host, resolveAuthoredAndSelectedSourceType, resolveNodeWithState, resolveNodeValueWithState, resolveTypeWithState, sourceValueDeclaration, sourceValueDeclarationSyntax } = scope;
  const reference = host.navigation.referenceFor(node);
  const declaration = sourceValueDeclaration(node, reference?.declaration);
  if (declaration === undefined) {
    return undefined;
  }
  const sourceFile = host.ast.getSourceFile(declaration) ?? queries.sourceFile;
  const syntax = sourceValueDeclarationSyntax(declaration);
  if (syntax.type !== undefined) {
    const resolved = resolveAuthoredAndSelectedSourceType(
      syntax.type,
      sourceFile,
      selectedType ?? queries.types.expressionType(node),
      queries.sourceFile,
      state,
    );
    if (resolved !== undefined) {
      return csharpSourceValueResult(resolveCsharpNativeParameterCarrier(scope, declaration, resolved, state));
    }
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    return csharpSourceValueResult(host.bindingProjection(declaration, sourceFile)?.bindingCarrier);
  }
  const declarationQueries = host.semantics(sourceFile);
  const induction = sourceIntegerInduction(declaration, host.ast, host.navigation, {
    sourceFacts: host.sourceFacts, semanticsFor: host.semanticsFor,
  });
  if (induction !== undefined) {
    const bound = resolveNodeWithState(induction.bound, sourceFile, nextState(state));
    if (bound?.kind === "source-primitive" &&
      ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "int128", "uint128", "native-int", "native-uint"].includes(bound.name)) {
      return csharpSourceValueResult(bound);
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
      if (declaredSource === undefined || selectedSource === undefined) return csharpSourceValueResult(native);
      const refinement = selectCsharpAuthoredUnionRefinement(native, declaredSource, selectedSource, queries,
        type => resolveCsharpUnionMemberCarrier(scope, native, type, queries, state),
        host.structuralTypes.resolveTarget, host.typeDefinitions);
      if (refinement.kind !== "not-applicable") return refinement.kind === "resolved" ? csharpSourceValueResult(refinement.type) : undefined;
      if (native.kind === "source-primitive") return csharpSourceValueResult(native);
      return csharpSourceValueResult(reconcileCsharpSelectedTargetType(native, selected, queries.types.relationship(declaredSource, selectedSource),
        queries.types.isNonPrimitive(selectedSource)));
    }
    return csharpSourceValueResult(resolveCsharpNativeParameterCarrier(scope, declaration, retainCsharpBroadValueCarrier(declaredTarget, selected,
      selectedSource !== undefined && queries.types.isNonPrimitive(selectedSource)) ?? selected ?? declaredTarget, state));
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
  const initializerResult = arrayInitializer
    ? resolveNodeValueWithState(syntax.initializer, sourceFile, nextState(state))
    : widenedInitializer ? csharpSourceValueResult(declaredTarget)
    : csharpSourceValueResult(resolveDirectSourceFacts(scope, [syntax.initializer], sourceFile, nextState(state))) ??
      resolveSelectedExpressionResult(scope, syntax.initializer, declarationQueries, nextState(state)) ??
      (declaredTarget !== undefined && (declaredCallable || !mutableVariable && declarationKind !== "const")
        ? csharpSourceValueResult(declaredTarget)
        : resolveNodeValueWithState(syntax.initializer, sourceFile, nextState(state)));
  const initializerTarget = initializerResult?.selectedType;
  if (initializerTarget === undefined) {
    return arrayInitializer ? undefined : csharpSourceValueResult(declaredTarget);
  }
  if (node === declaration) {
    return initializerResult;
  }
  const declaredType = queries.declarations.declaredValueType(declaration);
  const selectedValueType = selectedType ?? queries.types.expressionType(node);
  if (declaredType === undefined || selectedValueType === undefined) {
    return initializerResult;
  }
  const refinement = queries.types.refinement(
    declaredType,
    selectedValueType,
  );
  const selectedUnion = selectCsharpAuthoredUnionRefinement(initializerTarget, declaredType, selectedValueType,
    queries, type => resolveCsharpUnionMemberCarrier(scope, initializerTarget, type, queries, state),
    host.structuralTypes.resolveTarget, host.typeDefinitions);
  if (selectedUnion.kind !== "not-applicable") return selectedUnion.kind === "resolved"
    ? refineCsharpSourceValueResult(initializerResult, selectedUnion.type) : undefined;
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
      return refineCsharpSourceValueResult(initializerResult,
        selectedMembers.some(member => queries.types.isNullish(member)) ? initializerTarget : present);
    }
    return refineCsharpSourceValueResult(initializerResult, reconcileCsharpSelectedTargetType(
      initializerTarget,
      resolveTypeWithState(selectedValueType, queries.sourceFile, nextState(state)),
      queries.types.relationship(declaredType, selectedValueType),
      queries.types.isNonPrimitive(selectedValueType),
    ));
  }
  if (
    refinement.kind === "members" &&
    refinement.types.length > 0 &&
    refinement.types.every((member) => !queries.types.isNullish(member))
  ) {
    return refineCsharpSourceValueResult(initializerResult, getCsharpNullableElementTargetType(initializerTarget) ??
      initializerTarget);
  }
  return initializerResult;
}
