import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveCsharpConstructorValueType } from "./constructors.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { IsTypeSyntaxNode, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { failTargetCompilerResourceLimit } from "@tsonic/target-api/artifacts";
import { nextState } from "./state.js";
import { resolveKeywordType } from "../../../../policy/types/resolution/source-primitives.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";

import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import { resolveCsharpProviderIndexedAccess } from "./indexed-access.js";
import { csharpSourceStorageContext, csharpSourceStorageComponentContext } from "./source-storage-projection.js";

import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpPublishedParameterCarrier } from "./source-references.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
import { resolveCsharpSourceEffectiveType } from "./effective-types.js";
export function resolveNodeValueWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const selected = resolveNodeResultWithState(scope, node, sourceFile, state);
  return node === undefined ? selected : refineCsharpSourceValueResult(selected,
    resolveCsharpNativeParameterCarrier(scope, node, selected?.selectedType, state));
}

function resolveNodeResultWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const { host, resolveCallableType, resolveDirectSourceFacts, resolveNodeWithState, resolveProjectThisTargetType, resolveSelectedExpressionResult, resolveTupleTypeNode, resolveTypeReferenceNode, resolveTypeWithState } = scope;
  if (node === undefined) return undefined;
  const effective = resolveCsharpSourceEffectiveType(scope, node, state);
  if (effective !== undefined) {
    if (effective.result === undefined || !host.ast.is.IsArrayLiteralExpression(node)) return effective.result;
    const queries = sourceFile === undefined ? host.semanticsFor(node) : host.semantics(sourceFile);
    const selection = scope.resolveArrayLiteralWithState(node, queries, state);
    if (selection.kind === "unavailable") return undefined;
    const literalAdmission = selection.kind === "rejected"
      ? selection
      : Object.freeze({ kind: "resolved" as const, type: selection.carrier });
    if (literalAdmission.kind === "rejected") state.rejectNativeResolution?.(literalAdmission);
    return Object.freeze({ ...effective.result, literalAdmission });
  }
  if (!IsTypeSyntaxNode(host.ast, node) && !host.ast.is.IsTypeLiteralNode(node) &&
    !host.ast.is.IsNamedTupleMember(node) && !host.ast.is.IsExpressionWithTypeArguments(node) &&
    !host.ast.is.IsTypeParameterDeclaration(node)) return undefined;
  if (state.depth > maximumTypeResolutionDepth) failTargetCompilerResourceLimit("tsonic-csharp",
    "Selected native source-node type resolution", "depth", maximumTypeResolutionDepth, node);
  state = csharpSourceStorageContext(host, state, node);
  if (
    host.ast.is.IsSourceFile(node) ||
    host.ast.is.IsImportDeclaration(node) ||
    host.ast.is.IsImportClause(node) ||
    host.ast.kindName(node) === "KindEndOfFile"
  ) {
    return undefined;
  }
  const queries = sourceFile === undefined
    ? host.semanticsFor(node)
    : host.semantics(sourceFile);
  const scopedTargetType = host.representations.scopedTargetType(node);
  if (scopedTargetType !== undefined) {
    const selected = queries.types.expressionType(node);
    return selected === undefined ? csharpSourceValueResult(scopedTargetType)
      : scope.resolveSelectedValueResultWithState(node, selected, queries.sourceFile, state);
  }
  const syntaxFact = resolveCsharpProviderIndexedAccess(scope, node, queries, state) ?? resolveDirectSourceFacts(
    [node],
    queries.sourceFile,
    state,
  );
  if (syntaxFact !== undefined) {
    return csharpSourceValueResult(syntaxFact);
  }
  const contextualParameter = selectCsharpPublishedParameterCarrier(scope, node, state);
  if (contextualParameter.kind !== "not-applicable") return contextualParameter.kind === "resolved"
    ? csharpSourceValueResult(contextualParameter.type) : undefined;
  const selectedExpression = resolveSelectedExpressionResult(
    node,
    queries,
    state,
  );
  if (selectedExpression !== undefined) {
    return selectedExpression;
  }
  const direct = resolveDirectSourceFacts(
    sourceFactSubjectsForNode(node, host.navigation),
    queries.sourceFile,
    state,
  );
  if (direct !== undefined) {
    return csharpSourceValueResult(direct);
  }
  const scalar = resolveKeywordType(host.ast.kindName(node));
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
  if (host.ast.is.IsTypeReferenceNode(node)) {
    const resolved = resolveTypeReferenceNode(node, queries, state);
    if (resolved !== undefined) {
      return csharpSourceValueResult(resolved);
    }
  }
  const projectThis = resolveProjectThisTargetType(node);
  if (projectThis !== undefined) {
    return csharpSourceValueResult(projectThis);
  }
  return csharpSourceValueResult(resolveFallbackNodeCarrier(scope, node, queries, state));
}

function resolveFallbackNodeCarrier(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveProjectSourceType, resolveTypeWithState } = scope;
  if (!host.ast.is.IsClassDeclaration(node) && !host.ast.is.IsInterfaceDeclaration(node)) {
    const constructor = resolveCsharpConstructorValueType(scope, queries.types.expressionType(node), queries, state);
    if (constructor !== undefined) return constructor;
  }
  const projectType = resolveProjectSourceType(node, queries.sourceFile, state);
  if (projectType !== undefined) {
    return projectType;
  }
  const structuralType = host.structuralTypes.resolveNode(
    node,
    queries.sourceFile,
    nextState(state),
  );
  if (structuralType !== undefined) {
    return structuralType;
  }
  const reference = host.navigation.referenceFor(node);
  const declaration = reference?.declaration;
  const typeNode = declaration === undefined ? undefined : host.ast.typeNode(declaration);
  return typeNode === undefined ? resolveTypeWithState(queries.types.expressionType(node), queries.sourceFile, nextState(state))
    : scope.resolveAuthoredAndSelectedSourceType(typeNode, host.ast.getSourceFile(typeNode) ?? queries.sourceFile,
      queries.types.expressionType(node), queries.sourceFile, nextState(state));
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
