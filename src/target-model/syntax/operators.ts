import type { AstReader, Node } from "@tsonic/tsts";

export type CsharpSourceOperator =
  | "==="
  | "=="
  | "!=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||"
  | "??"
  | "&"
  | "|"
  | "^"
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "**"
  | "/"
  | "%"
  | "="
  | "+="
  | "-="
  | "*="
  | "**="
  | "/="
  | "%="
  | "&&="
  | "&="
  | "||="
  | "|="
  | "??="
  | "^="
  | "<<="
  | ">>="
  | ">>>="
  | "!"
  | "~"
  | "++"
  | "--"
  | ","
  | "in"
  | "instanceof";

export type CsharpAssignmentOperator = Extract<
  CsharpSourceOperator,
  | "="
  | "+="
  | "-="
  | "*="
  | "**="
  | "/="
  | "%="
  | "&&="
  | "&="
  | "||="
  | "|="
  | "??="
  | "^="
  | "<<="
  | ">>="
  | ">>>="
>;

export function isCsharpAssignmentOperator(
  operator: CsharpSourceOperator,
): operator is CsharpAssignmentOperator {
  switch (operator) {
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "**=":
    case "/=":
    case "%=":
    case "&&=":
    case "&=":
    case "||=":
    case "|=":
    case "??=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
      return true;
    default:
      return false;
  }
}

export interface CsharpDestructuringAssignmentSyntax {
  readonly expression: Node;
  readonly pattern: Node;
  readonly source: Node;
}

export function isCsharpDestructuringAssignmentPattern(
  ast: AstReader,
  node: Node | undefined,
): node is Node {
  return node !== undefined &&
    (
      ast.is.IsArrayLiteralExpression(node) ||
      ast.is.IsObjectLiteralExpression(node)
    );
}

export function csharpDestructuringAssignmentSyntax(
  ast: AstReader,
  node: Node | undefined,
): CsharpDestructuringAssignmentSyntax | undefined {
  if (
    node === undefined ||
    !ast.is.IsBinaryExpression(node) ||
    ast.operatorKindName(node) !== "KindEqualsToken"
  ) {
    return undefined;
  }
  const expression = ast.as.AsBinaryExpression(node);
  const pattern = expression?.Left;
  const source = expression?.Right;
  return pattern !== undefined &&
      source !== undefined &&
      isCsharpDestructuringAssignmentPattern(ast, pattern)
    ? { expression: node, pattern, source }
    : undefined;
}

export function sourceOperatorFromKindName(
  kindName: string | undefined,
): CsharpSourceOperator | undefined {
  switch (kindName) {
    case "KindEqualsEqualsEqualsToken":
      return "===";
    case "KindEqualsEqualsToken":
      return "==";
    case "KindExclamationEqualsEqualsToken":
      return "!==";
    case "KindExclamationEqualsToken":
      return "!=";
    case "KindLessThanToken":
      return "<";
    case "KindLessThanEqualsToken":
      return "<=";
    case "KindGreaterThanToken":
      return ">";
    case "KindGreaterThanEqualsToken":
      return ">=";
    case "KindAmpersandAmpersandToken":
      return "&&";
    case "KindBarBarToken":
      return "||";
    case "KindQuestionQuestionToken":
      return "??";
    case "KindAmpersandToken":
      return "&";
    case "KindBarToken":
      return "|";
    case "KindCaretToken":
      return "^";
    case "KindLessThanLessThanToken":
      return "<<";
    case "KindGreaterThanGreaterThanToken":
      return ">>";
    case "KindGreaterThanGreaterThanGreaterThanToken":
      return ">>>";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindAsteriskToken":
      return "*";
    case "KindAsteriskAsteriskToken":
      return "**";
    case "KindSlashToken":
      return "/";
    case "KindPercentToken":
      return "%";
    case "KindEqualsToken":
      return "=";
    case "KindPlusEqualsToken":
      return "+=";
    case "KindMinusEqualsToken":
      return "-=";
    case "KindAsteriskEqualsToken":
      return "*=";
    case "KindAsteriskAsteriskEqualsToken":
      return "**=";
    case "KindSlashEqualsToken":
      return "/=";
    case "KindPercentEqualsToken":
      return "%=";
    case "KindAmpersandAmpersandEqualsToken":
      return "&&=";
    case "KindAmpersandEqualsToken":
      return "&=";
    case "KindBarBarEqualsToken":
      return "||=";
    case "KindBarEqualsToken":
      return "|=";
    case "KindQuestionQuestionEqualsToken":
      return "??=";
    case "KindCaretEqualsToken":
      return "^=";
    case "KindLessThanLessThanEqualsToken":
      return "<<=";
    case "KindGreaterThanGreaterThanEqualsToken":
      return ">>=";
    case "KindGreaterThanGreaterThanGreaterThanEqualsToken":
      return ">>>=";
    case "KindExclamationToken":
      return "!";
    case "KindTildeToken":
      return "~";
    case "KindPlusPlusToken":
      return "++";
    case "KindMinusMinusToken":
      return "--";
    case "KindCommaToken":
      return ",";
    case "KindInKeyword":
      return "in";
    case "KindInstanceOfKeyword":
      return "instanceof";
    default:
      return undefined;
  }
}
