import type { ExtensionObservationContext, Node } from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";

export function getBinaryOperatorText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const operatorToken = asNodeSubject(getNodeField(node, "OperatorToken"));
  return operatorToken === undefined ? undefined : getOperatorTextFromKindName(ast.kindName(operatorToken));
}

export function getPrefixUnaryOperatorText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const operator = getNodeField(node, "Operator");
  if (typeof operator === "string") {
    return getOperatorTextFromKindName(operator);
  }
  if (typeof operator !== "number") {
    const token = asNodeSubject(getNodeField(node, "OperatorToken"));
    return token === undefined ? undefined : getOperatorTextFromKindName(ast.kindName(token));
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  const sourceFile = ast.getSourceFile(node);
  const sourceText = ast.getSourceText(sourceFile);
  const start = ast.pos(node);
  const end = operand === undefined ? ast.end(node) : ast.pos(operand);
  const prefixText = start < 0 || end < start
    ? ""
    : sourceText.slice(start, end).trimStart();
  return getPrefixOperatorTextFromSource(prefixText);
}

export function getPostfixUnaryOperatorText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const operator = getNodeField(node, "Operator");
  if (typeof operator === "string") {
    return getOperatorTextFromKindName(operator);
  }
  if (typeof operator !== "number") {
    const token = asNodeSubject(getNodeField(node, "OperatorToken"));
    return token === undefined ? undefined : getOperatorTextFromKindName(ast.kindName(token));
  }
  const operand = asNodeSubject(getNodeField(node, "Operand"));
  const sourceFile = ast.getSourceFile(node);
  const sourceText = ast.getSourceText(sourceFile);
  const start = operand === undefined ? ast.pos(node) : ast.end(operand);
  const end = ast.end(node);
  const postfixText = start < 0 || end < start
    ? ""
    : sourceText.slice(start, end).trimEnd();
  return getPostfixOperatorTextFromSource(postfixText);
}

function getPrefixOperatorTextFromSource(text: string): string | undefined {
  if (text.startsWith("++")) {
    return "++";
  }
  if (text.startsWith("--")) {
    return "--";
  }
  if (text.startsWith("+")) {
    return "+";
  }
  if (text.startsWith("-")) {
    return "-";
  }
  if (text.startsWith("!")) {
    return "!";
  }
  if (text.startsWith("~")) {
    return "~";
  }
  return undefined;
}

function getPostfixOperatorTextFromSource(text: string): string | undefined {
  if (text.endsWith("++")) {
    return "++";
  }
  if (text.endsWith("--")) {
    return "--";
  }
  return undefined;
}

function getOperatorTextFromKindName(kind: string): string | undefined {
  switch (kind) {
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
    case "KindInKeyword":
      return "in";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindAsteriskToken":
      return "*";
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
    default:
      return undefined;
  }
}
