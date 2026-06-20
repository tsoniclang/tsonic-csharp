import type { AstReader, Node, SourceFile } from "@tsonic/tsts";

interface SourceAstNodeList<T = SourceAstNode> {
  readonly Nodes?: readonly (T | undefined)[];
}

export type SourceAstNode<T extends object = object> = Node & T & {
  readonly ArgumentExpression?: SourceAstNode;
  readonly Arguments?: SourceAstNodeList;
  readonly AwaitModifier?: SourceAstNode;
  readonly Block?: SourceAstNode;
  readonly Body?: SourceAstNode;
  readonly CaseBlock?: SourceAstNode;
  readonly CatchClause?: SourceAstNode;
  readonly Clauses?: SourceAstNodeList;
  readonly Condition?: SourceAstNode;
  readonly Constraint?: SourceAstNode;
  readonly DeclarationList?: SourceAstNode;
  readonly Declarations?: SourceAstNodeList;
  readonly DefaultType?: SourceAstNode;
  readonly DotDotDotToken?: SourceAstNode;
  readonly ElementType?: SourceAstNode;
  readonly Elements?: SourceAstNodeList;
  readonly ElseStatement?: SourceAstNode;
  readonly Expression?: SourceAstNode;
  readonly FinallyBlock?: SourceAstNode;
  readonly Flags?: number;
  readonly Head?: SourceAstNode;
  readonly HeritageClauses?: SourceAstNodeList;
  readonly Incrementor?: SourceAstNode;
  readonly Initializer?: SourceAstNode;
  readonly IsExportEquals?: boolean;
  readonly Label?: SourceAstNode;
  readonly Left?: SourceAstNode;
  readonly Literal?: SourceAstNode;
  readonly Members?: SourceAstNodeList;
  readonly Name?: SourceAstNode;
  readonly OperatorToken?: SourceAstNode;
  readonly Parameters?: SourceAstNodeList;
  readonly Parent?: SourceAstNode;
  readonly Properties?: SourceAstNodeList;
  readonly PropertyName?: SourceAstNode;
  readonly QuestionDotToken?: SourceAstNode;
  readonly Right?: SourceAstNode;
  readonly Statement?: SourceAstNode;
  readonly Statements?: SourceAstNodeList;
  readonly TemplateSpans?: SourceAstNodeList;
  readonly Text?: string;
  readonly ThenStatement?: SourceAstNode;
  readonly Token?: SourceAstNode;
  readonly TryBlock?: SourceAstNode;
  readonly Type?: SourceAstNode;
  readonly TypeArguments?: SourceAstNodeList;
  readonly TypeName?: SourceAstNode;
  readonly TypeParameters?: SourceAstNodeList;
  readonly Types?: SourceAstNodeList;
  readonly VariableDeclaration?: SourceAstNode;
  readonly WhenFalse?: SourceAstNode;
  readonly WhenTrue?: SourceAstNode;
  readonly ObjectAssignmentInitializer?: SourceAstNode;
  readonly Operand?: SourceAstNode;
  readonly name?: SourceAstNode;
};

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

export const ModifierFlagsPublic = 1 << 0;
export const ModifierFlagsPrivate = 1 << 1;
export const ModifierFlagsProtected = 1 << 2;
export const ModifierFlagsReadonly = 1 << 3;
export const ModifierFlagsOverride = 1 << 4;
export const ModifierFlagsAbstract = 1 << 6;
export const ModifierFlagsAmbient = 1 << 7;
export const ModifierFlagsStatic = 1 << 8;
export const ModifierFlagsAccessor = 1 << 9;
export const ModifierFlagsAsync = 1 << 10;
export const NodeFlagsConst = 1 << 1;

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

export function HasSyntacticModifier(node: Node, flag: number): boolean {
  const modifierFlags = Number((node as { readonly ModifierFlags?: unknown }).ModifierFlags ?? 0);
  return (modifierFlags & flag) !== 0;
}

export function Node_Text(node: Node | undefined): string {
  return String((node as { readonly Text?: unknown } | undefined)?.Text ?? "");
}

export function Node_Name(node: Node | undefined): Node | undefined {
  return (node as { readonly Name?: Node } | undefined)?.Name;
}

export function Node_Expression(node: Node | undefined): Node | undefined {
  return (node as { readonly Expression?: Node } | undefined)?.Expression;
}

export function Node_Symbol(node: Node | undefined): object | undefined {
  return (node as { readonly Symbol?: object } | undefined)?.Symbol;
}

export function SourceFile_FileName(sourceFile: SourceFile): string {
  const fileName = (sourceFile as { readonly FileName?: unknown }).FileName;
  return typeof fileName === "function" ? String(fileName()) : String(fileName ?? "");
}

export const AsArrayLiteralExpression = cast;
export const AsArrowFunction = cast;
export const AsAsExpression = cast;
export const AsAwaitExpression = cast;
export const AsBinaryExpression = cast;
export const AsBindingElement = cast;
export const AsBindingPattern = cast;
export const AsBlock = cast;
export const AsBreakStatement = cast;
export const AsCallExpression = cast;
export const AsCaseBlock = cast;
export const AsCaseOrDefaultClause = cast;
export const AsCatchClause = cast;
export const AsClassDeclaration = cast;
export const AsClassStaticBlockDeclaration = cast;
export const AsConditionalExpression = cast;
export const AsConstructorDeclaration = cast;
export const AsContinueStatement = cast;
export const AsDoStatement = cast;
export const AsElementAccessExpression = cast;
export const AsEnumDeclaration = cast;
export const AsEnumMember = cast;
export const AsExportAssignment = cast;
export const AsExpressionStatement = cast;
export const AsExpressionWithTypeArguments = cast;
export const AsForInOrOfStatement = cast;
export const AsForStatement = cast;
export const AsFunctionDeclaration = cast;
export const AsFunctionExpression = cast;
export const AsGetAccessorDeclaration = cast;
export const AsHeritageClause = cast;
export const AsIdentifier = cast;
export const AsIfStatement = cast;
export const AsIndexSignatureDeclaration = cast;
export const AsInterfaceDeclaration = cast;
export const AsLabeledStatement = cast;
export const AsMethodDeclaration = cast;
export const AsMethodSignatureDeclaration = cast;
export const AsNewExpression = cast;
export const AsNoSubstitutionTemplateLiteral = cast;
export const AsNonNullExpression = cast;
export const AsNumericLiteral = cast;
export const AsObjectLiteralExpression = cast;
export const AsParameterDeclaration = cast;
export const AsParenthesizedExpression = cast;
export const AsPostfixUnaryExpression = cast;
export const AsPrefixUnaryExpression = cast;
export const AsPrivateIdentifier = cast;
export const AsPropertyAccessExpression = cast;
export const AsPropertyAssignment = cast;
export const AsPropertyDeclaration = cast;
export const AsPropertySignatureDeclaration = cast;
export const AsRegularExpressionLiteral = cast;
export const AsReturnStatement = cast;
export const AsSatisfiesExpression = cast;
export const AsSetAccessorDeclaration = cast;
export const AsShorthandPropertyAssignment = cast;
export const AsSpreadAssignment = cast;
export const AsSpreadElement = cast;
export const AsStringLiteral = cast;
export const AsSwitchStatement = cast;
export const AsTemplateExpression = cast;
export const AsTemplateSpan = cast;
export const AsThrowStatement = cast;
export const AsTryStatement = cast;
export const AsTypeAssertion = cast;
export const AsTypeParameterDeclaration = cast;
export const AsTypeReferenceNode = cast;
export const AsVariableDeclaration = cast;
export const AsVariableDeclarationList = cast;
export const AsVariableStatement = cast;
export const AsVoidExpression = cast;
export const AsWhileStatement = cast;

function cast(node: Node | undefined): SourceAstNode | undefined {
  return node as SourceAstNode | undefined;
}
