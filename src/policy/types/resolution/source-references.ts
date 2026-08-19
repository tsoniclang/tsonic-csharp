import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type {
  SourceCallableTypeEvidence,
  SourceFileSemantics,
} from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../model/definitions.js";
import { classifyCsharpSourceProfileType, selectedCsharpSourceProfileOwner } from "./source-profile.js";
import { csharpJsArrayTargetType } from "./surface-types.js";
import { csharpSourceTypeArgumentNodes } from "./source-syntax.js";
import { getCsharpCollectionElementTargetType } from "../collections.js";
import { getCsharpNullableElementTargetType } from "../storage/nullable.js";
import { nextState } from "./state.js";
import { sourceFactSubjectsForNode, definedValues } from "./source-evidence.js";
import { sourcePrimitiveFactKey } from "@tsonic/tsts";
import {
  sourceTransformedTypeFactEvidenceNodes,
  sourceTupleElementTypeEvidenceNodes,
  sourceTypeSyntaxIsCompositional,
} from "@tsonic/target-api/source";
import { substituteTargetTypeParameters } from "../callables/substitution.js";
import { targetTypeRefKey, targetTypeRefEquals } from "../model/equality.js";

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
  const semanticType = queries.getTypeFromTypeNode(node);
  const subjects = [
    ...sourceFactSubjectsForNode(typeName, queries, node),
    ...(semanticType === undefined
      ? []
      : queries.getTypeFactSubjects(semanticType)),
  ];
  const direct = resolveDirectSourceFacts(subjects, queries.sourceFile, state);
  if (direct !== undefined) {
    return direct;
  }
  const standardTransformation = semanticType === undefined
    ? undefined
    : queries.selectStandardTypeTransformation(node, semanticType);
  if (
    standardTransformation !== undefined &&
    standardTransformation.kind !== "structural" &&
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
  const typeArguments = csharpSourceTypeArgumentNodes(host.ast, node).map((argument) =>
    resolveNodeWithState(argument, queries.sourceFile, nextState(state))
  );
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const providerType = resolveProviderType(
    subjects,
    typeArguments as readonly TargetTypeRef[],
  );
  if (providerType !== undefined) {
    return providerType;
  }
  const sourceProfileType = semanticType === undefined
    ? undefined
    : resolveSourceProfileType(
        classifyCsharpSourceProfileType(semanticType, queries, host.ast),
        typeArguments as readonly TargetTypeRef[],
      );
  if (sourceProfileType !== undefined) {
    return sourceProfileType;
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
    state,
  );
  if (sourceAlias.kind === "resolved") {
    return sourceAlias.type;
  }
  if (sourceAlias.kind === "rejected") {
    return undefined;
  }
  const projectType = resolveProjectSourceType(
    typeName,
    queries.sourceFile,
    state,
    typeArguments as readonly TargetTypeRef[],
  );
  if (projectType !== undefined) {
    return projectType;
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
  const standard = queries.selectStandardTypeTransformation(
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
  if (queries.isTuple(selectedType)) {
    const infos = queries.getTupleElementInfos(selectedType);
    const elements = infos.map((element) => {
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
        state,
      ) ?? resolveTypeWithState(
        element.type,
        queries.sourceFile,
        nextState(state),
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
    authoredRoot,
  );
}


export function resolveStandardSourceTypeTransformation(
  { host, resolveCallableEvidence, resolveSignatureParameterEvidence, resolveSignatureParameterListTarget, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  transformation: NonNullable<
    ReturnType<SourceFileSemantics["selectStandardTypeTransformation"]>
  >,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node,
  selectedType: Type,
): TargetTypeRef | undefined {
  if (transformation.kind === "unresolved") {
    return undefined;
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
  const restIndexes = parameters.flatMap((parameter, index) =>
    parameter.parameterKind === "rest" ? [index] : []
  );
  if (restIndexes.length === 0) {
    return { kind: "tuple", elements };
  }
  if (restIndexes.length !== 1) {
    return undefined;
  }
  const restIndex = restIndexes[0]!;
  const restElement = getCsharpCollectionElementTargetType(
    elements[restIndex],
  );
  if (restElement === undefined) {
    return undefined;
  }
  const homogeneous = elements.every((element, index) => {
    const value = index === restIndex
      ? restElement
      : getCsharpNullableElementTargetType(element) ?? element;
    return targetTypeRefEquals(value, restElement);
  });
  if (!homogeneous) {
    return undefined;
  }
  return selectedCsharpSourceProfileOwner(host.target) === "js"
    ? csharpJsArrayTargetType(restElement)
    : { kind: "array", element: restElement };
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
  { host, resolveCheckerTransformedSourceType, resolveNodeWithState }: CsharpTypeResolutionScope,
  typeName: Node,
  typeArguments: readonly TargetTypeRef[],
  selectedType: Type | undefined,
  state: CsharpTypeResolutionState,
):
  | { readonly kind: "not-alias" }
  | { readonly kind: "checker-transformed-alias" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected" } {
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
  const substitutions = new Map<string, TargetTypeRef>();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    const name = host.ast.name(parameter);
    const argument = typeArguments[index];
    if (parameter === undefined || name === undefined || argument === undefined) {
      return { kind: "rejected" };
    }
    const key = host.ast.text(name);
    if (substitutions.has(key)) {
      return { kind: "rejected" };
    }
    substitutions.set(key, argument);
  }
  const resolved = target === undefined
    ? undefined
    : sourceTypeSyntaxIsCompositional(host.ast, target)
      ? resolveNodeWithState(
          target,
          reference.sourceFile,
          nextState(state),
        )
      : selectedType === undefined
        ? undefined
        : resolveCheckerTransformedSourceType(
            target,
            selectedType,
            host.semantics(reference.sourceFile),
            nextState(state),
          );
  if (resolved === undefined) {
    return { kind: "checker-transformed-alias" };
  }
  return {
    kind: "resolved",
    type: substituteTargetTypeParameters(resolved, substitutions),
  };
}


export function targetPreservesAuthoredSourcePrimitiveFacts(
  { collectTargetSourcePrimitiveNames, host }: CsharpTypeResolutionScope,
  node: Node,
  target: TargetTypeRef,
  queries: SourceFileSemantics,
): boolean {
  const required = new Set(definedValues(
    queries.getAuthoredTypeFactSubjects(node)
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


export function resolveSourceValueDeclaration(
  { host, resolveAuthoredAndSelectedSourceType, resolveDirectSourceFacts, resolveNodeWithState, resolveSelectedExpressionType, resolveTypeWithState, sourceValueDeclaration, sourceValueDeclarationSyntax }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): TargetTypeRef | undefined {
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
      selectedType ?? queries.getTypeAtLocation(node),
      queries.sourceFile,
      state,
    );
    if (resolved !== undefined) {
      return resolved;
    }
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    return undefined;
  }
  const declarationQueries = host.semantics(sourceFile);
  const declaredTarget = resolveTypeWithState(
    declarationQueries.getDeclaredValueType(declaration),
    sourceFile,
    nextState(state),
  );
  if (syntax.initializer === undefined) {
    return resolveTypeWithState(
      selectedType ?? queries.getTypeAtLocation(node),
      queries.sourceFile,
      nextState(state),
    ) ?? declaredTarget;
  }
  const selectedInitializerTarget = resolveDirectSourceFacts(
    [syntax.initializer],
    sourceFile,
    nextState(state),
  ) ?? resolveSelectedExpressionType(
    syntax.initializer,
    declarationQueries,
    nextState(state),
  );
  if (
    host.ast.variableDeclarationKind(declaration) !== "const" &&
    selectedInitializerTarget === undefined &&
    declaredTarget !== undefined
  ) {
    return declaredTarget;
  }
  const initializerTarget = selectedInitializerTarget ??
    resolveNodeWithState(
      syntax.initializer,
      sourceFile,
      nextState(state),
    );
  if (initializerTarget === undefined) {
    return declaredTarget;
  }
  const declaredType = declarationQueries.getTypeAtLocation(
    syntax.initializer,
  );
  const selectedValueType = selectedType ?? queries.getTypeAtLocation(node);
  if (declaredType === undefined || selectedValueType === undefined) {
    return initializerTarget;
  }
  const refinement = declarationQueries.selectTypeRefinement(
    declaredType,
    selectedValueType,
  );
  if (refinement.kind === "ambiguous") {
    return undefined;
  }
  if (
    refinement.kind === "members" &&
    refinement.types.length > 0 &&
    refinement.types.every((member) => !declarationQueries.isNullish(member))
  ) {
    return getCsharpNullableElementTargetType(initializerTarget) ??
      initializerTarget;
  }
  return initializerTarget;
}
