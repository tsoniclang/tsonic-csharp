import type {
  CsharpAssignmentOperatorToken,
  CsharpBinaryOperatorToken,
  CsharpPostfixUnaryOperatorToken,
  CsharpPrefixUnaryOperatorToken,
} from "../roslyn/syntax.js";

export function csharpBinaryOperatorTokenFromText(text: string): CsharpBinaryOperatorToken | undefined {
  switch (text) {
    case "&&":
      return { kind: "AmpersandAmpersandToken" };
    case "||":
      return { kind: "BarBarToken" };
    case "??":
      return { kind: "QuestionQuestionToken" };
    case "&":
      return { kind: "AmpersandToken" };
    case "|":
      return { kind: "BarToken" };
    case "^":
      return { kind: "CaretToken" };
    case "==":
      return { kind: "EqualsEqualsToken" };
    case "!=":
      return { kind: "ExclamationEqualsToken" };
    case "<":
      return { kind: "LessThanToken" };
    case "<=":
      return { kind: "LessThanEqualsToken" };
    case ">":
      return { kind: "GreaterThanToken" };
    case ">=":
      return { kind: "GreaterThanEqualsToken" };
    case "<<":
      return { kind: "LessThanLessThanToken" };
    case ">>":
      return { kind: "GreaterThanGreaterThanToken" };
    case ">>>":
      return { kind: "GreaterThanGreaterThanGreaterThanToken" };
    case "+":
      return { kind: "PlusToken" };
    case "-":
      return { kind: "MinusToken" };
    case "*":
      return { kind: "AsteriskToken" };
    case "/":
      return { kind: "SlashToken" };
    case "%":
      return { kind: "PercentToken" };
    default:
      return undefined;
  }
}

export function csharpAssignmentOperatorTokenFromText(text: string): CsharpAssignmentOperatorToken | undefined {
  switch (text) {
    case "=":
      return { kind: "EqualsToken" };
    case "+=":
      return { kind: "PlusEqualsToken" };
    case "-=":
      return { kind: "MinusEqualsToken" };
    case "*=":
      return { kind: "AsteriskEqualsToken" };
    case "/=":
      return { kind: "SlashEqualsToken" };
    case "%=":
      return { kind: "PercentEqualsToken" };
    case "&=":
      return { kind: "AmpersandEqualsToken" };
    case "|=":
      return { kind: "BarEqualsToken" };
    case "^=":
      return { kind: "CaretEqualsToken" };
    case "<<=":
      return { kind: "LessThanLessThanEqualsToken" };
    case ">>=":
      return { kind: "GreaterThanGreaterThanEqualsToken" };
    case ">>>=":
      return { kind: "GreaterThanGreaterThanGreaterThanEqualsToken" };
    default:
      return undefined;
  }
}

export function csharpPrefixUnaryOperatorTokenFromText(text: string): CsharpPrefixUnaryOperatorToken | undefined {
  switch (text) {
    case "+":
      return { kind: "PlusToken" };
    case "-":
      return { kind: "MinusToken" };
    case "~":
      return { kind: "TildeToken" };
    case "!":
      return { kind: "ExclamationToken" };
    case "++":
      return { kind: "PlusPlusToken" };
    case "--":
      return { kind: "MinusMinusToken" };
    default:
      return undefined;
  }
}

export function csharpPostfixUnaryOperatorTokenFromText(text: string): CsharpPostfixUnaryOperatorToken | undefined {
  switch (text) {
    case "++":
      return { kind: "PlusPlusToken" };
    case "--":
      return { kind: "MinusMinusToken" };
    default:
      return undefined;
  }
}
