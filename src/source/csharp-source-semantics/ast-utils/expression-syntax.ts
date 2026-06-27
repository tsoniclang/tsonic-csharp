import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../../fact-subjects.js";
import {
  getNodeField,
} from "./node-access.js";
import {
  isTypeSyntaxNode,
} from "./type-syntax.js";

export function isControlFlowLabelIdentifier(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  if (!ast.is.IsIdentifier(node)) {
    return false;
  }
  const parent = ast.parent(node);
  if (parent === undefined) {
    return false;
  }
  const parentKind = ast.kindName(parent);
  return (
    parentKind === "KindLabeledStatement" ||
    parentKind === "KindBreakStatement" ||
    parentKind === "KindContinueStatement"
  ) && (
    asNodeSubject(getNodeField(parent, "Label")) === node ||
    asNodeSubject(getNodeField(parent, "label")) === node
  );
}

export function isValueExpressionSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  if (isTypeSyntaxNode(ast, node) || isNonValueChildPosition(ast, node)) {
    return false;
  }
  return isKnownExpressionSyntaxKind(ast, node);
}

export function isSemanticTypeQueryableValueExpressionNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return isValueExpressionSyntaxNode(ast, node) && !isLiteralValueSyntaxNode(ast, node);
}

export function isLiteralValueSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  switch (ast.kindName(node)) {
    case "KindStringLiteral":
    case "KindNumericLiteral":
    case "KindBigIntLiteral":
    case "KindTrueKeyword":
    case "KindFalseKeyword":
    case "KindNullKeyword":
    case "KindNoSubstitutionTemplateLiteral":
      return true;
    default:
      return false;
  }
}

function isKnownExpressionSyntaxKind(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  if (
    ast.is.IsArrayLiteralExpression(node) ||
    ast.is.IsObjectLiteralExpression(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node) ||
    ast.is.IsCallExpression(node) ||
    ast.is.IsNewExpression(node) ||
    ast.is.IsBinaryExpression(node) ||
    ast.is.IsPrefixUnaryExpression(node) ||
    ast.is.IsPostfixUnaryExpression(node) ||
    ast.is.IsConditionalExpression(node) ||
    ast.is.IsFunctionExpression(node) ||
    ast.is.IsArrowFunction(node) ||
    ast.is.IsClassExpression(node) ||
    ast.is.IsParenthesizedExpression(node) ||
    ast.is.IsAsExpression(node) ||
    ast.is.IsSatisfiesExpression(node) ||
    ast.is.IsNonNullExpression(node) ||
    ast.is.IsTemplateExpression(node) ||
    ast.is.IsTaggedTemplateExpression(node) ||
    ast.is.IsRegularExpressionLiteral(node) ||
    ast.is.IsKeywordExpression(node) ||
    ast.is.IsDeleteExpression(node) ||
    ast.is.IsTypeOfExpression(node) ||
    ast.is.IsVoidExpression(node) ||
    ast.is.IsAwaitExpression(node)
  ) {
    return true;
  }
  switch (ast.kindName(node)) {
    case "KindIdentifier":
    case "KindPrivateIdentifier":
    case "KindStringLiteral":
    case "KindNumericLiteral":
    case "KindBigIntLiteral":
    case "KindTrueKeyword":
    case "KindFalseKeyword":
    case "KindNullKeyword":
    case "KindThisKeyword":
    case "KindSuperKeyword":
    case "KindNoSubstitutionTemplateLiteral":
      return true;
    default:
      return false;
  }
}

function isNonValueChildPosition(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  const parent = ast.parent(node);
  if (parent === undefined) {
    return true;
  }
  if (isTypeSyntaxNode(ast, parent)) {
    return true;
  }
  if (ast.name(parent) === node) {
    return true;
  }
  if (
    asNodeSubject(getNodeField(parent, "Name")) === node ||
    asNodeSubject(getNodeField(parent, "name")) === node ||
    asNodeSubject(getNodeField(parent, "ModuleSpecifier")) === node ||
    asNodeSubject(getNodeField(parent, "moduleSpecifier")) === node ||
    asNodeSubject(getNodeField(parent, "ImportClause")) === node ||
    asNodeSubject(getNodeField(parent, "importClause")) === node ||
    asNodeSubject(getNodeField(parent, "NamedBindings")) === node ||
    asNodeSubject(getNodeField(parent, "namedBindings")) === node ||
    asNodeSubject(getNodeField(parent, "TypeName")) === node ||
    asNodeSubject(getNodeField(parent, "typeName")) === node ||
    asNodeSubject(getNodeField(parent, "Type")) === node ||
    asNodeSubject(getNodeField(parent, "type")) === node ||
    asNodeSubject(getNodeField(parent, "ElementType")) === node ||
    asNodeSubject(getNodeField(parent, "elementType")) === node ||
    asNodeSubject(getNodeField(parent, "Constraint")) === node ||
    asNodeSubject(getNodeField(parent, "constraint")) === node ||
    asNodeSubject(getNodeField(parent, "Label")) === node ||
    asNodeSubject(getNodeField(parent, "label")) === node ||
    asNodeSubject(getNodeField(parent, "PropertyName")) === node ||
    asNodeSubject(getNodeField(parent, "propertyName")) === node
  ) {
    return true;
  }
  const parentKind = ast.kindName(parent);
  return parentKind === "KindImportDeclaration" ||
    parentKind === "KindImportClause" ||
    parentKind === "KindImportSpecifier" ||
    parentKind === "KindNamedImports" ||
    parentKind === "KindNamespaceImport" ||
    parentKind === "KindExportDeclaration" ||
    parentKind === "KindExportSpecifier" ||
    parentKind === "KindNamedExports" ||
    parentKind === "KindTypeParameter";
}
