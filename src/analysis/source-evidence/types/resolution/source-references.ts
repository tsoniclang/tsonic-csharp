import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";

import { nextState } from "./state.js";
import { sourceTypeSyntaxIsCompositional, sourceTypeSyntaxRoot } from "@tsonic/target-api/source";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { completeCsharpBoundSourceType, csharpBoundSourceType, csharpSourceBindings, csharpSourceTemplateState } from "./type-bindings.js";
import { resolveCsharpConditionalApplication } from "./conditional-types.js";
import { csharpConditionalDeclaration } from "./conditional-application-source.js";
import { formCsharpTypeReferenceSource, type CsharpTypeReferenceSource } from "./type-reference-source.js";
import { resolveFormedCsharpProjectReference } from "./project-types.js";
import { formCsharpPrimitivePreservationSource, completeCsharpPrimitivePreservation } from "./primitive-preservation-source.js";
import { formCsharpSourceValueDeclarationSource, formCsharpSourceValueSource, resolveFormedCsharpSourceValueResult } from "./value-source.js";
import { formCsharpStandardTypeTransformationSource, resolveFormedCsharpStandardTypeTransformation } from "./standard-transformation-source.js";
import { formCsharpCheckerTransformationSource, resolveFormedCsharpCheckerTransformation } from "./checker-transformation-source.js";
import { formCsharpEvidenceNodesSource, resolveFormedCsharpEvidenceNodesToCommonTarget } from "./evidence-node-source.js";

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
  const { resolveFormedCheckerTransformation, resolveCompositionalSourceTypeAlias, resolveFormedDirectSourceFacts, resolveNodeWithState, resolveProviderType, resolveSourceProfileType, resolveFormedStandardSourceTypeTransformation, resolveTypeWithState, targetPreservesAuthoredSourcePrimitiveFacts } = scope;
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
  let transformedTarget: TargetTypeRef | undefined;
  if (sourceAlias.kind === "checker-transformed-alias" && semanticType !== undefined) {
    const checker = source.checker;
    if (checker === undefined || checker.authoredRoot !== node || checker.selectedType !== semanticType ||
        checker.queries !== queries || checker.state !== state) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A type reference requires its exact retained checker transformation Source.", node);
    }
    transformedTarget = resolveFormedCheckerTransformation(checker);
  }
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
  const standard = queries.types.standardTransformation(authoredRoot, selectedType);
  return resolveFormedCsharpCheckerTransformation(scope,
    formCsharpCheckerTransformationSource(scope, authoredRoot, selectedType, queries, state, standard));
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
  scope: CsharpTypeResolutionScope,
  nodes: readonly Node[],
  selectedType: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpEvidenceNodesToCommonTarget(scope,
    formCsharpEvidenceNodesSource(scope, nodes, selectedType, queries, state));
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
  const { host, resolveNodeWithState, resolveFormedCheckerTransformation } = scope;
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
  let resolved: TargetTypeRef | undefined;
  if (target !== undefined) {
    if (sourceTypeSyntaxIsCompositional(host.ast, target) || host.ast.is.IsTypeQueryNode(target)) {
      resolved = resolveNodeWithState(target, reference.sourceFile, nextState(boundState));
    } else if (selectedType !== undefined) {
      const selectedState = nextState(boundState);
      const standard = queries.types.standardTransformation(target, selectedType);
      const input = formCsharpCheckerTransformationSource(scope, target, selectedType, queries, selectedState, standard);
      resolved = resolveFormedCheckerTransformation(input);
    }
  }
  if (resolved === undefined) {
    return { kind: "checker-transformed-alias" };
  }
  return {
    kind: "resolved",
    type: sourceArguments === undefined ? substituteTargetTypeParameters(resolved, substitutions) : resolved,
  };
}

export function targetPreservesAuthoredSourcePrimitiveFacts(
  scope: CsharpTypeResolutionScope,
  node: Node,
  target: TargetTypeRef,
  queries: SourceFileSemantics,
): boolean {
  return completeCsharpPrimitivePreservation(scope, formCsharpPrimitivePreservationSource(scope, node, queries), target);
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
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): TargetTypeRef | undefined {
  return resolveSourceValueResult(scope, node, queries, state, selectedType)?.selectedType;
}

export function resolveSourceValueResult(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  selectedType?: Type,
): CsharpSourceCallResult | undefined {
  return resolveFormedCsharpSourceValueResult(scope, formCsharpSourceValueSource(scope,
    formCsharpSourceValueDeclarationSource(scope, node), queries, state, selectedType));
}
