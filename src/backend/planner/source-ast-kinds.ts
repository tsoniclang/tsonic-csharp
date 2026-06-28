import type { AstReader, Node } from "@tsonic/tsts";

export const KindAnyKeyword = "KindAnyKeyword";
export const KindArrayBindingPattern = "KindArrayBindingPattern";
export const KindArrayLiteralExpression = "KindArrayLiteralExpression";
export const KindArrayType = "KindArrayType";
export const KindArrowFunction = "KindArrowFunction";
export const KindAsExpression = "KindAsExpression";
export const KindAwaitExpression = "KindAwaitExpression";
export const KindBindingElement = "KindBindingElement";
export const KindBinaryExpression = "KindBinaryExpression";
export const KindBigIntLiteral = "KindBigIntLiteral";
export const KindBlock = "KindBlock";
export const KindBreakStatement = "KindBreakStatement";
export const KindCallExpression = "KindCallExpression";
export const KindClassDeclaration = "KindClassDeclaration";
export const KindClassStaticBlockDeclaration = "KindClassStaticBlockDeclaration";
export const KindConditionalExpression = "KindConditionalExpression";
export const KindConstructor = "KindConstructor";
export const KindContinueStatement = "KindContinueStatement";
export const KindDebuggerStatement = "KindDebuggerStatement";
export const KindDefaultClause = "KindDefaultClause";
export const KindDeleteExpression = "KindDeleteExpression";
export const KindDoStatement = "KindDoStatement";
export const KindElementAccessExpression = "KindElementAccessExpression";
export const KindEmptyStatement = "KindEmptyStatement";
export const KindEnumDeclaration = "KindEnumDeclaration";
export const KindEnumMember = "KindEnumMember";
export const KindEqualsToken = "KindEqualsToken";
export const KindExportAssignment = "KindExportAssignment";
export const KindExportDeclaration = "KindExportDeclaration";
export const KindExpressionStatement = "KindExpressionStatement";
export const KindExpressionWithTypeArguments = "KindExpressionWithTypeArguments";
export const KindExtendsKeyword = "KindExtendsKeyword";
export const KindFalseKeyword = "KindFalseKeyword";
export const KindForInStatement = "KindForInStatement";
export const KindForOfStatement = "KindForOfStatement";
export const KindForStatement = "KindForStatement";
export const KindFunctionDeclaration = "KindFunctionDeclaration";
export const KindFunctionExpression = "KindFunctionExpression";
export const KindGetAccessor = "KindGetAccessor";
export const KindIdentifier = "KindIdentifier";
export const KindIfStatement = "KindIfStatement";
export const KindImplementsKeyword = "KindImplementsKeyword";
export const KindImportDeclaration = "KindImportDeclaration";
export const KindIndexSignature = "KindIndexSignature";
export const KindInterfaceDeclaration = "KindInterfaceDeclaration";
export const KindLabeledStatement = "KindLabeledStatement";
export const KindMethodDeclaration = "KindMethodDeclaration";
export const KindMethodSignature = "KindMethodSignature";
export const KindNewExpression = "KindNewExpression";
export const KindNeverKeyword = "KindNeverKeyword";
export const KindNoSubstitutionTemplateLiteral = "KindNoSubstitutionTemplateLiteral";
export const KindNonNullExpression = "KindNonNullExpression";
export const KindNullKeyword = "KindNullKeyword";
export const KindNumericLiteral = "KindNumericLiteral";
export const KindObjectBindingPattern = "KindObjectBindingPattern";
export const KindObjectKeyword = "KindObjectKeyword";
export const KindObjectLiteralExpression = "KindObjectLiteralExpression";
export const KindOmittedExpression = "KindOmittedExpression";
export const KindParameter = "KindParameter";
export const KindParenthesizedExpression = "KindParenthesizedExpression";
export const KindPostfixUnaryExpression = "KindPostfixUnaryExpression";
export const KindPrefixUnaryExpression = "KindPrefixUnaryExpression";
export const KindPrivateIdentifier = "KindPrivateIdentifier";
export const KindPropertyAccessExpression = "KindPropertyAccessExpression";
export const KindPropertyAssignment = "KindPropertyAssignment";
export const KindPropertyDeclaration = "KindPropertyDeclaration";
export const KindPropertySignature = "KindPropertySignature";
export const KindRegularExpressionLiteral = "KindRegularExpressionLiteral";
export const KindReturnStatement = "KindReturnStatement";
export const KindSatisfiesExpression = "KindSatisfiesExpression";
export const KindSetAccessor = "KindSetAccessor";
export const KindShorthandPropertyAssignment = "KindShorthandPropertyAssignment";
export const KindSpreadAssignment = "KindSpreadAssignment";
export const KindSpreadElement = "KindSpreadElement";
export const KindStringLiteral = "KindStringLiteral";
export const KindSuperKeyword = "KindSuperKeyword";
export const KindSwitchStatement = "KindSwitchStatement";
export const KindTemplateExpression = "KindTemplateExpression";
export const KindThisKeyword = "KindThisKeyword";
export const KindThrowStatement = "KindThrowStatement";
export const KindTrueKeyword = "KindTrueKeyword";
export const KindTryStatement = "KindTryStatement";
export const KindTypeAliasDeclaration = "KindTypeAliasDeclaration";
export const KindTypeAssertionExpression = "KindTypeAssertionExpression";
export const KindTypeLiteral = "KindTypeLiteral";
export const KindTypeOfExpression = "KindTypeOfExpression";
export const KindTypeReference = "KindTypeReference";
export const KindTupleType = "KindTupleType";
export const KindUnionType = "KindUnionType";
export const KindUnknownKeyword = "KindUnknownKeyword";
export const KindVariableDeclaration = "KindVariableDeclaration";
export const KindVariableDeclarationList = "KindVariableDeclarationList";
export const KindVariableStatement = "KindVariableStatement";
export const KindVoidExpression = "KindVoidExpression";
export const KindWhileStatement = "KindWhileStatement";

export function kindName(node: Node | undefined): string {
  return node === undefined ? "Undefined" : String((node as { readonly Kind?: unknown }).Kind);
}

export function hasKind(node: Node | undefined, expected: string): boolean {
  return kindName(node) === expected;
}

export function SourceKind(ast: AstReader, node: Node | undefined): string {
  return ast.kindName(node);
}

export function SourceTokenKind(_ast: AstReader, kind: unknown): string {
  return typeof kind === "number" ? `Kind${kind}` : "Undefined";
}

export function HasSourceKind(ast: AstReader, node: Node | undefined, expected: string): boolean {
  return ast.kindName(node) === expected;
}

export function IsTypeSyntaxNode(ast: AstReader, node: Node): boolean {
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

export function KindString(kind: unknown): string {
  return String(kind);
}
