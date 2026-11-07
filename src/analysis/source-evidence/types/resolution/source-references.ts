import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { classifyCsharpSourceProfileDeclaration, classifyCsharpSourceProfileType, selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";

import { csharpSourceTypeArgumentNodes } from "../../../../target-model/syntax/type-arguments.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";

import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpNeverTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { nextState } from "./state.js";
import { sourceFactSubjectsForNode, definedValues } from "./source-evidence.js";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
import { sourceTransformedTypeFactEvidenceNodes, sourceTupleElementTypeEvidenceNodes, sourceTypeSyntaxIsCompositional, sourceTypeSyntaxRoot } from "@tsonic/target-api/source";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefKey, targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpBoundSourceType, csharpSourceBindings, csharpSourceTemplateState } from "./type-bindings.js";
import { csharpConditionalDeclaration, resolveCsharpConditionalApplication } from "./conditional-types.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { resolveCsharpSourceEffectiveType } from "./effective-types.js";

export function resolveTypeReferenceNode(
  { host, resolveCheckerTransformedSourceType, resolveCompositionalSourceTypeAlias, selectDirectSourceFacts, resolveNodeWithState, resolveProjectSourceType, resolveProviderType, resolveSourceProfileType, resolveStandardSourceTypeTransformation, resolveTypeWithState, targetPreservesAuthoredSourcePrimitiveFacts }: CsharpTypeResolutionScope,
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
  const direct = selectDirectSourceFacts(subjects, queries.sourceFile, state);
  if (direct.kind !== "not-applicable") return direct.kind === "resolved" ? direct.type : undefined;
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
    semanticType,
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
  if (transformation.kind === "non-nullish") {
    if (queries.types.isNever(selectedType)) return csharpNeverTargetType();
    const input = resolveSourceTypeComponentEvidence(transformation.component, queries, state);
    return getCsharpNullableElementTargetType(input) ?? input;
  }
  if (transformation.kind === "component") {
    return resolveSourceTypeComponentEvidence(
      transformation.component,
      queries,
      state,
    );
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
    const publication = resolveCsharpSourceEffectiveType(scope, reference.declaration, templateState);
    return publication?.outcome.kind !== "resolved" || publication.result === undefined ||
      publication.outcome.type.kind !== "declared" || publication.outcome.type.declaration !== reference.declaration ||
      publication.outcome.type.typeArguments.length !== parameters.length ? { kind: "rejected" }
      : { kind: "resolved", type: substituteTargetTypeParameters(publication.result.selectedType, substitutions) };
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

export function selectCsharpPublishedParameterCarrier(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  state: CsharpTypeResolutionState,
): { readonly kind: "not-applicable" } | { readonly kind: "unresolved" } |
  { readonly kind: "resolved"; readonly type: TargetTypeRef } {
  const { host } = scope;
  if (!host.ast.is.IsParameterDeclaration(declaration)) return { kind: "not-applicable" };
  const effective = resolveCsharpSourceEffectiveType(scope, declaration, state);
  return effective?.result === undefined ? { kind: "unresolved" }
    : { kind: "resolved", type: effective.result.selectedType };
}
