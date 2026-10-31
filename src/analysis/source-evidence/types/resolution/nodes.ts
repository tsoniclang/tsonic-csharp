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
import { nextState } from "./state.js";
import { resolveCsharpSourceLiteralTargetType } from "../../../../policy/conversions/source-literals.js";
import { resolveKeywordType } from "../../../../policy/types/resolution/source-primitives.js";
import { selectedCsharpSourceProfileOwner } from "../../../../policy/identities/source-types.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";

import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import { resolveCsharpProviderIndexedAccess } from "./indexed-access.js";
import { csharpSourceStorageContext, csharpSourceStorageComponentContext } from "./source-storage-projection.js";

import { selectCsharpParameterListCarrier } from "../../../../policy/types/callables/parameter-list.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpContextualParameterCarrier } from "./source-references.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { csharpSourceValueResult, refineCsharpSourceValueResult } from "./call-results.js";
export function resolveNodeValueWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const selected = resolveNodeCarrierWithState(scope, node, sourceFile, state);
  return node === undefined ? selected : refineCsharpSourceValueResult(selected,
    resolveCsharpNativeParameterCarrier(scope, node, selected?.selectedType, state));
}

function resolveNodeCarrierWithState(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const { host, resolveCallableType, resolveDirectSourceFacts, resolveNodeWithState, resolveProjectSourceType, resolveProjectThisTargetType, resolveSelectedExpressionResult, resolveSourceValueResult, resolveTupleTypeNode, resolveTypeReferenceNode, resolveTypeWithState } = scope;
  if (node === undefined || state.depth > maximumTypeResolutionDepth) {
    return undefined;
  }
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
  const indexed = resolveCsharpProviderIndexedAccess(scope, node, queries, state);
  if (indexed !== undefined) return csharpSourceValueResult(indexed);
  const syntaxFact = resolveDirectSourceFacts(
    [node],
    queries.sourceFile,
    state,
  );
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
  const contextualParameter = selectCsharpContextualParameterCarrier(scope, node, queries, state);
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
  const literal = resolveCsharpSourceLiteralTargetType(host, host.literalValues.literalValue.get(node));
  if (literal !== undefined) {
    return csharpSourceValueResult(literal);
  }
  const keyword = resolveKeywordType(
    host.ast.kindName(node),
  );
  if (keyword !== undefined) {
    return csharpSourceValueResult(keyword);
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
    if (element !== undefined) {
      return csharpSourceValueResult(selectedCsharpSourceProfileOwner(host.target) === "js"
        ? csharpJsArrayTargetType(element)
        : { kind: "array", element });
    }
    return csharpSourceValueResult(resolveTypeWithState(
      queries.types.authoredType(node),
      queries.sourceFile,
      nextState(state),
    ));
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
  const selectedType = host.ast.is.IsIdentifier(node) ? queries.types.expressionType(node) : undefined;
  const declaration = selectedType === undefined ? undefined : host.navigation.referenceFor(node)?.declaration;
  const declaredValue = selectedType !== undefined && scope.sourceValueDeclaration(node, declaration) !== undefined
    ? scope.resolveSelectedValueResultWithState(node, selectedType, queries.sourceFile, state)
    : resolveSourceValueResult(node, queries, state);
  if (declaredValue !== undefined) {
    return declaredValue;
  }
  if (!host.ast.is.IsClassDeclaration(node) && !host.ast.is.IsInterfaceDeclaration(node)) {
    const constructor = resolveCsharpConstructorValueType(scope, queries.types.expressionType(node), queries, state);
    if (constructor !== undefined) return csharpSourceValueResult(constructor);
  }
  const projectType = resolveProjectSourceType(node, queries.sourceFile, state);
  if (projectType !== undefined) {
    return csharpSourceValueResult(projectType);
  }
  const structuralType = host.structuralTypes.resolveNode(
    node,
    queries.sourceFile,
    nextState(state),
  );
  if (structuralType !== undefined) {
    return csharpSourceValueResult(structuralType);
  }
  return csharpSourceValueResult(resolveTypeWithState(
    queries.types.expressionType(node),
    queries.sourceFile,
    nextState(state),
  ));
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
