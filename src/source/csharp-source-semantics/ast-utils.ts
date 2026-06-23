import type {
  AstReader,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../fact-subjects.js";
export {
  asNodeSubject,
} from "../fact-subjects.js";

export function isTypeSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  const kind = ast.kindName(node);
  if (
    kind === "KindAnyKeyword" ||
    kind === "KindUnknownKeyword" ||
    kind === "KindBooleanKeyword" ||
    kind === "KindNumberKeyword" ||
    kind === "KindStringKeyword" ||
    kind === "KindBigIntKeyword" ||
    kind === "KindVoidKeyword" ||
    kind === "KindNeverKeyword" ||
    kind === "KindObjectKeyword" ||
    kind === "KindSymbolKeyword" ||
    kind === "KindTypeReference" ||
    kind === "KindUnionType" ||
    kind === "KindIntersectionType" ||
    kind === "KindArrayType" ||
    kind === "KindTupleType" ||
    kind === "KindTypeLiteral" ||
    kind === "KindFunctionType" ||
    kind === "KindConstructorType" ||
    kind === "KindLiteralType" ||
    kind === "KindIndexedAccessType" ||
    kind === "KindConditionalType" ||
    kind === "KindInferType" ||
    kind === "KindMappedType" ||
    kind === "KindOptionalType" ||
    kind === "KindRestType" ||
    kind === "KindParenthesizedType" ||
    kind === "KindTemplateLiteralType" ||
    kind === "KindImportType" ||
    kind === "KindThisType"
  ) {
    return true;
  }
  return ast.is.IsKeywordTypeNode(node) ||
    ast.is.IsTypeReferenceNode(node) ||
    ast.is.IsUnionTypeNode(node) ||
    ast.is.IsIntersectionTypeNode(node) ||
    ast.is.IsConditionalTypeNode(node) ||
    ast.is.IsInferTypeNode(node) ||
    ast.is.IsArrayTypeNode(node) ||
    ast.is.IsIndexedAccessTypeNode(node) ||
    ast.is.IsLiteralTypeNode(node) ||
    ast.is.IsThisTypeNode(node) ||
    ast.is.IsMappedTypeNode(node) ||
    ast.is.IsTupleTypeNode(node) ||
    ast.is.IsOptionalTypeNode(node) ||
    ast.is.IsRestTypeNode(node) ||
    ast.is.IsParenthesizedTypeNode(node) ||
    ast.is.IsFunctionTypeNode(node) ||
    ast.is.IsConstructorTypeNode(node) ||
    ast.is.IsTemplateLiteralTypeNode(node) ||
    ast.is.IsImportTypeNode(node);
}

export function isTypeLiteralLikeNode(node: Node): boolean {
  return getNodeList(getNodeField(node, "Members")).length > 0 &&
    getNodeField(node, "name") === undefined &&
    getNodeField(node, "HeritageClauses") === undefined;
}

export function visitStructuralNodes(
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  for (const child of getStructuralChildNodes(node)) {
    if (child !== undefined) {
      visitStructuralNodes(child, visitor, seen);
    }
  }
}

export function visitAstReaderNodes(
  ast: AstReader,
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  for (const child of getAstReaderChildNodes(ast, node)) {
    if (child !== undefined) {
      visitAstReaderNodes(ast, child, visitor, seen);
    }
  }
}

export function getNodeList(value: unknown): readonly Node[] {
  const nodes = (value as { readonly Nodes?: readonly unknown[] } | undefined)?.Nodes;
  return nodes === undefined
    ? []
    : nodes.map(asNodeSubject).filter((node): node is Node => node !== undefined);
}

export function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(node, field)?.value;
}

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

export function getNodeNameText(node: Node): string {
  const name = asNodeSubject(getNodeField(node, "name"));
  const text = (name as { readonly Text?: unknown } | undefined)?.Text;
  return typeof text === "function" || text === undefined ? "" : String(text);
}

export function getStructuralChildNodes(node: Node): readonly Node[] {
  const children: Node[] = [];
  const listFields = ["Statements", "Members", "Parameters", "TypeParameters", "TypeArguments", "Types", "Arguments", "Elements", "Properties", "Declarations"];
  for (const key of listFields) {
    children.push(...getNodeList(getNodeField(node, key)));
  }
  const nodeFields = [
    "name",
    "Body",
    "Type",
    "ElementType",
    "Constraint",
    "Expression",
    "Initializer",
    "Left",
    "Right",
    "ThenStatement",
    "ElseStatement",
    "Statement",
    "DeclarationList",
    "ImportClause",
    "NamedBindings",
    "ModuleSpecifier",
    "TypeName",
  ];
  for (const key of nodeFields) {
    const direct = asNodeSubject(getNodeField(node, key));
    if (direct !== undefined) {
      children.push(direct);
    }
  }
  return children;
}

export function getAstReaderChildNodes(
  ast: AstReader,
  node: Node,
): readonly (Node | undefined)[] {
  return [
    ...readAstNodeList(() => ast.children(node)),
    ...readAstNodeList(() => ast.typeArguments(node)),
    ...readAstNodeList(() => ast.typeParameters(node)),
    ...readAstNodeList(() => ast.parameters(node)),
    ...readAstNodeList(() => ast.members(node)),
    ...readAstNodeList(() => ast.elements(node)),
    ...readAstNodeList(() => ast.properties(node)),
    ...readAstNodeList(() => ast.arguments(node)),
    ...getStructuralChildNodes(node),
  ];
}

function readAstNodeList(read: () => readonly (Node | undefined)[]): readonly (Node | undefined)[] {
  try {
    return read();
  } catch {
    return [];
  }
}
