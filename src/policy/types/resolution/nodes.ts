import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../storage/runtime-carriers.js";
import { csharpJsArrayTargetType } from "./surface-types.js";
import { getCsharpCollectionElementTargetType } from "../collections.js";
import { getCsharpNullableElementTargetType, csharpNullableTargetType } from "../storage/nullable.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { nextState } from "./state.js";
import { resolveCsharpSourceLiteralTargetType } from "./source-literal-policy.js";
import { resolveKeywordType } from "./source-primitives.js";
import { selectedCsharpSourceProfileOwner } from "./source-profile.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";
import { targetTypeRefEquals } from "../model/equality.js";

export function resolveNodeWithState(
  { host, resolveDirectSourceFacts, resolveNodeWithState, resolveProjectSourceType, resolveProjectThisTargetType, resolveSelectedExpressionType, resolveSourceValueDeclaration, resolveTupleTypeNode, resolveTypeReferenceNode, resolveTypeWithState }: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (node === undefined || state.depth > maximumTypeResolutionDepth) {
    return undefined;
  }
  const scopedTargetType = host.representations.scopedTargetType(node);
  if (scopedTargetType !== undefined) {
    return scopedTargetType;
  }
  const queries = sourceFile === undefined
    ? host.semanticsFor(node)
    : host.semantics(sourceFile);
  const syntaxFact = resolveDirectSourceFacts(
    [node],
    queries.sourceFile,
    state,
  );
  if (syntaxFact !== undefined) {
    return syntaxFact;
  }
  const selectedExpression = resolveSelectedExpressionType(
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
    return direct;
  }
  const literal = resolveCsharpSourceLiteralTargetType(host, node);
  if (literal !== undefined) {
    return literal;
  }
  const keyword = resolveKeywordType(
    host.ast.kindName(node),
  );
  if (keyword !== undefined) {
    return keyword;
  }
  if (host.ast.is.IsArrayTypeNode(node)) {
    const element = resolveNodeWithState(
      host.ast.as.AsArrayTypeNode(node)!.ElementType,
      queries.sourceFile,
      nextState(state),
    );
    if (element !== undefined) {
      return selectedCsharpSourceProfileOwner(host.target) === "js"
        ? csharpJsArrayTargetType(element)
        : { kind: "array", element };
    }
    return resolveTypeWithState(
      queries.types.authoredType(node),
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsTupleTypeNode(node)) {
    return resolveTupleTypeNode(node, queries, state);
  }
  if (host.ast.is.IsUnionTypeNode(node)) {
    const members = host.ast.children(node).map((member) =>
      resolveNodeWithState(
        member,
        queries.sourceFile,
        nextState(state),
      )
    );
    return members.some((member) => member === undefined)
      ? undefined
      : combineCsharpTargetUnionMembers(
          members as readonly TargetTypeRef[],
        );
  }
  if (host.ast.is.IsNamedTupleMember(node)) {
    return resolveNodeWithState(
      host.ast.as.AsNamedTupleMember(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsParenthesizedTypeNode(node)) {
    return resolveNodeWithState(
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
    return inner === undefined ? undefined : csharpNullableTargetType(inner);
  }
  if (host.ast.is.IsRestTypeNode(node)) {
    return resolveNodeWithState(
      host.ast.as.AsRestTypeNode(node)!.Type,
      queries.sourceFile,
      nextState(state),
    );
  }
  if (
    host.ast.is.IsTypeOperatorNode(node) &&
    host.ast.operatorKindName(node) === "KindReadonlyKeyword"
  ) {
    return resolveNodeWithState(
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
      return host.projectTypeCatalog.targetTypeForDeclaration(
        definition.declaration,
        [],
      );
    }
  }
  if (host.ast.is.IsTypeReferenceNode(node)) {
    const resolved = resolveTypeReferenceNode(node, queries, state);
    if (resolved !== undefined) {
      return resolved;
    }
  }
  const projectThis = resolveProjectThisTargetType(node);
  if (projectThis !== undefined) {
    return projectThis;
  }
  const declaredValue = resolveSourceValueDeclaration(node, queries, state);
  if (declaredValue !== undefined) {
    return declaredValue;
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
  return resolveTypeWithState(
    queries.types.expressionType(node),
    queries.sourceFile,
    nextState(state),
  );
}


export function resolveTupleTypeNode(
  { host, resolveNodeWithState, tupleElementIsRest }: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const syntaxElements = host.ast.elements(node);
  const elements = syntaxElements.map((element) =>
    resolveNodeWithState(
      element,
      queries.sourceFile,
      nextState(state),
    )
  );
  if (elements.some((element) => element === undefined)) {
    return undefined;
  }
  const restIndexes = syntaxElements.flatMap((element, index) =>
    tupleElementIsRest(element) ? [index] : []
  );
  if (restIndexes.length === 0) {
    return {
      kind: "tuple",
      elements: elements as readonly TargetTypeRef[],
    };
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
    return value !== undefined && targetTypeRefEquals(value, restElement);
  });
  if (!homogeneous) {
    return undefined;
  }
  return selectedCsharpSourceProfileOwner(host.target) === "js"
    ? csharpJsArrayTargetType(restElement)
    : { kind: "array", element: restElement };
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
