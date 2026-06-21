import type { AstReader, Node } from "@tsonic/tsts";

export const KindAnyKeyword: any = "KindAnyKeyword";
export const KindArrayBindingPattern: any = "KindArrayBindingPattern";
export const KindArrayLiteralExpression: any = "KindArrayLiteralExpression";
export const KindArrayType: any = "KindArrayType";
export const KindArrowFunction: any = "KindArrowFunction";
export const KindAsExpression: any = "KindAsExpression";
export const KindAwaitExpression: any = "KindAwaitExpression";
export const KindBindingElement: any = "KindBindingElement";
export const KindBlock: any = "KindBlock";
export const KindBreakStatement: any = "KindBreakStatement";
export const KindCallExpression: any = "KindCallExpression";
export const KindClassDeclaration: any = "KindClassDeclaration";
export const KindClassStaticBlockDeclaration: any = "KindClassStaticBlockDeclaration";
export const KindConditionalExpression: any = "KindConditionalExpression";
export const KindConstructor: any = "KindConstructor";
export const KindContinueStatement: any = "KindContinueStatement";
export const KindDebuggerStatement: any = "KindDebuggerStatement";
export const KindDefaultClause: any = "KindDefaultClause";
export const KindDoStatement: any = "KindDoStatement";
export const KindElementAccessExpression: any = "KindElementAccessExpression";
export const KindEmptyStatement: any = "KindEmptyStatement";
export const KindEnumDeclaration: any = "KindEnumDeclaration";
export const KindEnumMember: any = "KindEnumMember";
export const KindEqualsToken: any = "KindEqualsToken";
export const KindExportAssignment: any = "KindExportAssignment";
export const KindExportDeclaration: any = "KindExportDeclaration";
export const KindExpressionStatement: any = "KindExpressionStatement";
export const KindExpressionWithTypeArguments: any = "KindExpressionWithTypeArguments";
export const KindExtendsKeyword: any = "KindExtendsKeyword";
export const KindFalseKeyword: any = "KindFalseKeyword";
export const KindForInStatement: any = "KindForInStatement";
export const KindForOfStatement: any = "KindForOfStatement";
export const KindForStatement: any = "KindForStatement";
export const KindFunctionDeclaration: any = "KindFunctionDeclaration";
export const KindFunctionExpression: any = "KindFunctionExpression";
export const KindGetAccessor: any = "KindGetAccessor";
export const KindIdentifier: any = "KindIdentifier";
export const KindIfStatement: any = "KindIfStatement";
export const KindImplementsKeyword: any = "KindImplementsKeyword";
export const KindImportDeclaration: any = "KindImportDeclaration";
export const KindIndexSignature: any = "KindIndexSignature";
export const KindInterfaceDeclaration: any = "KindInterfaceDeclaration";
export const KindLabeledStatement: any = "KindLabeledStatement";
export const KindMethodDeclaration: any = "KindMethodDeclaration";
export const KindMethodSignature: any = "KindMethodSignature";
export const KindNewExpression: any = "KindNewExpression";
export const KindNeverKeyword: any = "KindNeverKeyword";
export const KindNoSubstitutionTemplateLiteral: any = "KindNoSubstitutionTemplateLiteral";
export const KindNonNullExpression: any = "KindNonNullExpression";
export const KindNullKeyword: any = "KindNullKeyword";
export const KindNumericLiteral: any = "KindNumericLiteral";
export const KindObjectBindingPattern: any = "KindObjectBindingPattern";
export const KindObjectKeyword: any = "KindObjectKeyword";
export const KindObjectLiteralExpression: any = "KindObjectLiteralExpression";
export const KindParameter: any = "KindParameter";
export const KindParenthesizedExpression: any = "KindParenthesizedExpression";
export const KindPostfixUnaryExpression: any = "KindPostfixUnaryExpression";
export const KindPrefixUnaryExpression: any = "KindPrefixUnaryExpression";
export const KindPrivateIdentifier: any = "KindPrivateIdentifier";
export const KindPropertyAccessExpression: any = "KindPropertyAccessExpression";
export const KindPropertyAssignment: any = "KindPropertyAssignment";
export const KindPropertyDeclaration: any = "KindPropertyDeclaration";
export const KindPropertySignature: any = "KindPropertySignature";
export const KindRegularExpressionLiteral: any = "KindRegularExpressionLiteral";
export const KindReturnStatement: any = "KindReturnStatement";
export const KindSatisfiesExpression: any = "KindSatisfiesExpression";
export const KindSetAccessor: any = "KindSetAccessor";
export const KindShorthandPropertyAssignment: any = "KindShorthandPropertyAssignment";
export const KindSpreadAssignment: any = "KindSpreadAssignment";
export const KindSpreadElement: any = "KindSpreadElement";
export const KindStringLiteral: any = "KindStringLiteral";
export const KindSuperKeyword: any = "KindSuperKeyword";
export const KindSwitchStatement: any = "KindSwitchStatement";
export const KindTemplateExpression: any = "KindTemplateExpression";
export const KindThisKeyword: any = "KindThisKeyword";
export const KindThrowStatement: any = "KindThrowStatement";
export const KindTrueKeyword: any = "KindTrueKeyword";
export const KindTryStatement: any = "KindTryStatement";
export const KindTypeAliasDeclaration: any = "KindTypeAliasDeclaration";
export const KindTypeAssertionExpression: any = "KindTypeAssertionExpression";
export const KindTypeLiteral: any = "KindTypeLiteral";
export const KindTypeOfExpression: any = "KindTypeOfExpression";
export const KindTypeReference: any = "KindTypeReference";
export const KindUnionType: any = "KindUnionType";
export const KindUnknownKeyword: any = "KindUnknownKeyword";
export const KindVariableDeclaration: any = "KindVariableDeclaration";
export const KindVariableDeclarationList: any = "KindVariableDeclarationList";
export const KindVariableStatement: any = "KindVariableStatement";
export const KindVoidExpression: any = "KindVoidExpression";
export const KindWhileStatement: any = "KindWhileStatement";

export function kindName(node: Node | undefined): string {
  return node === undefined ? "Undefined" : String((node as { readonly Kind?: unknown }).Kind);
}

export function hasKind(node: Node | undefined, expected: string): boolean {
  return kindName(node) === expected;
}

export function SourceKind(ast: AstReader, node: Node | undefined): string {
  return ast.kindName(node);
}

export function SourceTokenKind(ast: AstReader, kind: unknown): string {
  void ast;
  return sourceTokenKindNames.get(Number(kind)) ?? String(kind);
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

const sourceTokenKindNames = new Map<number, string>([
  [29, "KindLessThanToken"],
  [31, "KindGreaterThanToken"],
  [32, "KindLessThanEqualsToken"],
  [33, "KindGreaterThanEqualsToken"],
  [34, "KindEqualsEqualsToken"],
  [35, "KindExclamationEqualsToken"],
  [36, "KindEqualsEqualsEqualsToken"],
  [37, "KindExclamationEqualsEqualsToken"],
  [39, "KindPlusToken"],
  [40, "KindMinusToken"],
  [41, "KindAsteriskToken"],
  [43, "KindSlashToken"],
  [44, "KindPercentToken"],
  [45, "KindPlusPlusToken"],
  [46, "KindMinusMinusToken"],
  [47, "KindLessThanLessThanToken"],
  [48, "KindGreaterThanGreaterThanToken"],
  [49, "KindGreaterThanGreaterThanGreaterThanToken"],
  [50, "KindAmpersandToken"],
  [51, "KindBarToken"],
  [52, "KindCaretToken"],
  [53, "KindExclamationToken"],
  [55, "KindAmpersandAmpersandToken"],
  [56, "KindBarBarToken"],
  [63, "KindEqualsToken"],
  [64, "KindPlusEqualsToken"],
  [65, "KindMinusEqualsToken"],
  [66, "KindAsteriskEqualsToken"],
  [68, "KindSlashEqualsToken"],
  [69, "KindPercentEqualsToken"],
  [95, "KindExtendsKeyword"],
  [118, "KindImplementsKeyword"],
]);
