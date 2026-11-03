import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveCsharpConstructorValueType } from "./constructors.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { failTargetAnalysisInvariant, failTargetCompilerResourceLimit } from "@tsonic/target-api/artifacts";
import { nextState } from "./state.js";
import { resolveCsharpSourceLiteralTargetType } from "../../../../policy/conversions/source-literals.js";
import { resolveKeywordType } from "../../../../policy/types/resolution/source-primitives.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";

import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import { resolveCsharpProviderIndexedAccess } from "./indexed-access.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { formCsharpNodeTypeSource, type CsharpNodeTypeSource } from "./root-sources.js";
import { resolveFormedCsharpProjectReference } from "./project-types.js";

import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import { resolveFormedCsharpContextualParameterCarrier } from "./contextual-parameter-source.js";
import { resolveFormedCsharpNativeParameterCarrier } from "./native-parameter-source.js";
import { resolveFormedCsharpProjectInstanceTargetType } from "./project-instance-source.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
export function resolveNodeValueWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  return resolveFormedCsharpNodeTypeSource(scope, formCsharpNodeTypeSource(scope, node, sourceFile, state));
}

export function resolveFormedCsharpNodeTypeSource(
  scope: CsharpTypeResolutionScope,
  source: CsharpNodeTypeSource,
): CsharpSourceCallResult | undefined {
  if (source.kind === "node" && source.declaredReceiver !== undefined) {
    const receiver = source.declaredReceiver;
    if (receiver.node !== source.node || receiver.queries !== source.queries || receiver.state !== source.state ||
      receiver.context !== scope.host.declaredObjectReceivers.get(source.node)) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver requires its exact Source occurrence, lexical context and bound state.", source.node);
    }
    const selected = receiver.source;
    if (selected !== undefined && (selected.node !== source.node || selected.queries !== source.queries ||
      selected.state !== source.state || selected.context !== receiver.context || selected.type !== source.selectedType ||
      selected.kind === "type" && (selected.declarations.length !== selected.members.length ||
        selected.declarations.some((member, index) => member !== undefined &&
          (member.property !== selected.members[index] || member.queries !== selected.queries))))) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver view requires the exact selected Source type and ordered declaration rows.", source.node);
    }
  }
  if (source.kind === "node" && (source.nativeParameter === undefined || source.nativeParameter.parameter !== source.node)) return failTargetAnalysisInvariant("tsonic-csharp",
    "A native parameter projection requires its exact retained Source node.", source.node);
  if (source.kind === "node" && (source.projectInstance === undefined || source.projectInstance.node !== source.node)) return failTargetAnalysisInvariant("tsonic-csharp",
    "A project instance requires its exact retained Source node.", source.node);
  if (source.kind === "node" && (source.contextualParameter === undefined ||
      source.contextualParameter.declaration !== source.node || source.contextualParameter.queries !== source.queries)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A contextual parameter requires its exact retained Source occurrence.", source.node);
  }
  const selected = resolveNodeResultWithState(scope, source);
  return source.kind === "unavailable" ? selected : refineCsharpSourceValueResult(selected,
    resolveFormedCsharpNativeParameterCarrier(scope, source.nativeParameter, selected?.selectedType, source.originalState));
}

function resolveNodeResultWithState(
  scope: CsharpTypeResolutionScope,
  source: CsharpNodeTypeSource,
): CsharpSourceCallResult | undefined {
  const { host, resolveCallableType, resolveFormedDirectSourceFacts, resolveNodeWithState, resolveFormedSelectedExpressionResult, resolveFormedSourceValueResult, resolveTupleTypeNode, resolveFormedTypeReferenceNode, resolveTypeWithState } = scope;
  if (source.node === undefined) return undefined;
  if (source.state.depth > maximumTypeResolutionDepth) failTargetCompilerResourceLimit("tsonic-csharp",
    "Selected native source-node type resolution", "depth", maximumTypeResolutionDepth, source.node);
  if (source.kind === "unavailable") return undefined;
  const { node, queries, state } = source;
  const scopedTargetType = host.representations.scopedTargetType(node);
  if (scopedTargetType !== undefined) {
    const selected = source.selectedType;
    return selected === undefined ? csharpSourceValueResult(scopedTargetType)
      : scope.resolveSelectedValueResultWithState(node, selected, queries.sourceFile, state);
  }
  const syntaxFact = resolveCsharpProviderIndexedAccess(scope, node, queries, state) ?? resolveFormedDirectSourceFacts(source.directSyntax);
  if (syntaxFact !== undefined) {
    return csharpSourceValueResult(syntaxFact);
  }
  if (host.ast.is.IsArrayLiteralExpression(node)) {
    const selection = scope.resolveArrayLiteralWithState(node, queries, state);
    if (selection.kind === "rejected") state.rejectNativeResolution?.(Object.freeze({ kind: "rejected", subject: node,
      code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH", reason: selection.reason }));
    return selection.kind === "resolved" ? csharpSourceValueResult(selection.carrier) : undefined;
  }
  if (host.ast.is.IsPropertyDeclaration(node) || host.ast.is.IsPropertySignatureDeclaration(node) ||
    host.ast.is.IsParameterDeclaration(node)) {
    const typeNode = host.ast.typeNode(node);
    if (typeNode !== undefined) {
      const declared = resolveNodeWithState(typeNode, queries.sourceFile, nextState(state));
      return csharpSourceValueResult(declared === undefined || host.ast.questionToken(node) === undefined
        ? declared : csharpNullableTargetType(declared));
    }
  }
  const contextualParameter = resolveFormedCsharpContextualParameterCarrier(scope, source.contextualParameter, state);
  if (contextualParameter.kind !== "not-applicable") return contextualParameter.kind === "resolved"
    ? csharpSourceValueResult(contextualParameter.type) : undefined;
  const selectedExpression = resolveFormedSelectedExpressionResult(source.selectedExpression);
  if (selectedExpression !== undefined) {
    return selectedExpression;
  }
  const direct = resolveFormedDirectSourceFacts(source.directValue);
  if (direct !== undefined) {
    return csharpSourceValueResult(direct);
  }
  const scalar = resolveCsharpSourceLiteralTargetType(host, host.literalValues.literalValue.get(node)) ??
    resolveKeywordType(host.ast.kindName(node));
  if (scalar !== undefined) {
    return csharpSourceValueResult(scalar);
  }
  if (host.ast.is.IsFunctionTypeNode(node)) {
    const selected = queries.types.authoredType(node);
    return selected === undefined ? undefined : csharpSourceValueResult(resolveCallableType(selected, queries, state));
  }
  if (host.ast.is.IsArrayTypeNode(node)) {
    const element = resolveNodeWithState(
      host.ast.as.AsArrayTypeNode(node)!.ElementType,
      queries.sourceFile,
      nextState(csharpSourceStorageComponentContext(host, state, { kind: "array-element" })),
    );
    const carrier = element === undefined
      ? resolveTypeWithState(queries.types.authoredType(node), queries.sourceFile, nextState(state))
      : selectedCsharpSourceProfileOwner(host.target) === "js" ? csharpJsArrayTargetType(element)
        : { kind: "array" as const, element };
    return csharpSourceValueResult(carrier);
  }
  if (host.ast.is.IsTupleTypeNode(node)) {
    return csharpSourceValueResult(resolveTupleTypeNode(node, queries, state));
  }
  if (host.ast.is.IsUnionTypeNode(node)) {
    const selected = queries.types.authoredType(node);
    if (selected !== undefined && (queries.types.isAny(selected) || queries.types.isUnknown(selected))) {
      return csharpSourceValueResult(resolveTypeWithState(selected, queries.sourceFile, nextState(state)));
    }
    const structural = selected === undefined ? { kind: "not-applicable" as const }
      : host.structuralTypes.resolveUnion(selected, queries.sourceFile, state);
    if (structural.kind !== "not-applicable") return structural.kind === "resolved" ? csharpSourceValueResult(structural.type) : undefined;
    const sourceMembers = host.ast.children(node).map(member => member === undefined ? undefined : queries.types.authoredType(member));
    if (selected === undefined || sourceMembers.some(member => member === undefined)) return undefined;
    let members: readonly (TargetTypeRef | undefined)[] = [];
    const carrier = scope.sourceUnionDefinitions.resolve(selected, queries, state, () => {
      members = host.ast.children(node).map(member => resolveNodeWithState(member, queries.sourceFile, nextState(state)));
      if (members.some(member => member === undefined)) return { carrier: undefined, arms: [] };
      const arms = members as readonly TargetTypeRef[];
      return { carrier: retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(arms), host.structuralTypes.resolveTarget), arms };
    });
    return csharpSourceValueResult(scope.sourceUnions.retain(carrier,
      members.map((member, index) => ({ source: sourceMembers[index]!, carrier: member! })), queries, state));
  }
  if (host.ast.is.IsNamedTupleMember(node)) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsNamedTupleMember(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsParenthesizedTypeNode(node)) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsParenthesizedTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsOptionalTypeNode(node)) {
    const inner = resolveNodeWithState(
      host.ast.as.AsOptionalTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
    return inner === undefined ? undefined : csharpSourceValueResult(csharpNullableTargetType(inner));
  }
  if (host.ast.is.IsRestTypeNode(node)) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsRestTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (
    host.ast.is.IsTypeOperatorNode(node) &&
    host.ast.operatorKindName(node) === "KindReadonlyKeyword"
  ) {
    return scope.resolveNodeValueWithState(
      host.ast.as.AsTypeOperatorNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsTypeQueryNode(node)) {
    const expression = host.ast.as.AsTypeQueryNode(node)?.ExprName;
    const reference = host.navigation.referenceFor(expression);
    const definition = host.projectTypeCatalog.definitionForDeclaration(
      reference?.declaration,
    );
    if (definition?.kind === "struct") {
      return csharpSourceValueResult(host.projectTypeCatalog.targetTypeForDeclaration(
        definition.declaration,
        [],
      ));
    }
  }
  if (source.reference !== undefined) {
    const resolved = resolveFormedTypeReferenceNode(source.reference);
    if (resolved !== undefined) {
      return csharpSourceValueResult(resolved);
    }
  }
  const projectThis = resolveFormedCsharpProjectInstanceTargetType(scope, source.projectInstance);
  if (projectThis !== undefined) {
    return csharpSourceValueResult(projectThis);
  }
  const selectedType = host.ast.is.IsIdentifier(node) ? source.selectedType : undefined;
  const value = source.value;
  if (value === undefined || value.node !== node || value.queries !== queries || value.state !== state || value.selectedType !== undefined) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A node value requires its exact retained declaration Source.", node);
  }
  const declaredValue = selectedType !== undefined && value.selection.declaration !== undefined
    ? scope.resolveSelectedValueResultWithState(node, selectedType, queries.sourceFile, state)
    : resolveFormedSourceValueResult(value);
  if (declaredValue !== undefined) {
    return declaredValue;
  }
  return csharpSourceValueResult(resolveFallbackNodeCarrier(scope, source));
}

function resolveFallbackNodeCarrier(
  scope: CsharpTypeResolutionScope,
  source: Extract<CsharpNodeTypeSource, { readonly kind: "node" }>,
): TargetTypeRef | undefined {
  const { host } = scope;
  const { node, queries, state } = source;
  if (!host.ast.is.IsClassDeclaration(node) && !host.ast.is.IsInterfaceDeclaration(node)) {
    const constructor = resolveCsharpConstructorValueType(scope, source.selectedType, queries, state);
    if (constructor !== undefined) return constructor;
  }
  const projectType = source.project === undefined ? undefined : resolveFormedCsharpProjectReference(scope, source.project);
  if (projectType !== undefined) {
    return projectType;
  }
  const structuralType = host.structuralTypes.completeNodeSource(source.structural);
  if (structuralType !== undefined) {
    return structuralType;
  }
  return scope.resolveFormedSemanticTypeSource(source.semantic);
}

export function resolveTupleTypeNode(
  { host, resolveNodeWithState, tupleElementIsRest }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const syntaxElements = host.ast.elements(node);
  const elements = syntaxElements.map((element, index) =>
    resolveNodeWithState(
      element,
      queries.sourceFile,
      nextState(csharpSourceStorageComponentContext(host, state, { kind: "tuple-element", index })),
    )
  );
  if (elements.some((element) => element === undefined)) {
    return undefined;
  }
  const restIndexes = syntaxElements.flatMap((element, index) =>
    tupleElementIsRest(element) ? [index] : []
  );
  return selectCsharpParameterListCarrier(elements as readonly TargetTypeRef[], restIndexes,
    selectedCsharpSourceProfileOwner(host.target) === "js");
}

export function tupleElementIsRest(
  { host }: CsharpTypeResolutionScope,
  element: Node | undefined,
): boolean {
  if (element === undefined) {
    return false;
  }
  if (host.ast.is.IsRestTypeNode(element)) {
    return true;
  }
  return host.ast.is.IsNamedTupleMember(element) &&
    host.ast.as.AsNamedTupleMember(element)?.DotDotDotToken !== undefined;
}
