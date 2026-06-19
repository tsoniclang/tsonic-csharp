import {
  AsArrayLiteralExpression,
  AsBinaryExpression,
  AsCallExpression,
  AsConditionalExpression,
  AsElementAccessExpression,
  AsIdentifier,
  AsNewExpression,
  AsNumericLiteral,
  AsParenthesizedExpression,
  AsPostfixUnaryExpression,
  AsPrefixUnaryExpression,
  AsPropertyAccessExpression,
  AsStringLiteral,
  KindAmpersandAmpersandToken,
  KindAsteriskToken,
  KindBarBarToken,
  KindBinaryExpression,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindConditionalExpression,
  KindElementAccessExpression,
  KindEqualsEqualsEqualsToken,
  KindEqualsEqualsToken,
  KindEqualsToken,
  KindExclamationEqualsEqualsToken,
  KindExclamationEqualsToken,
  KindExclamationToken,
  KindFalseKeyword,
  KindGreaterThanEqualsToken,
  KindGreaterThanToken,
  KindIdentifier,
  KindLessThanEqualsToken,
  KindLessThanToken,
  KindMinusMinusToken,
  KindMinusToken,
  KindNewExpression,
  KindNullKeyword,
  KindNumericLiteral,
  KindParenthesizedExpression,
  KindPercentToken,
  KindPlusPlusToken,
  KindPlusToken,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAccessExpression,
  KindQuestionQuestionToken,
  KindSlashToken,
  KindStringLiteral,
  KindThisKeyword,
  KindTrueKeyword,
  Node_Text,
} from "@tsonic/tsts";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression } from "../ast/csharp-ast.js";
import { expressionToCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { sanitizeIdentifier } from "./identifiers.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  switch (node.Kind) {
    case KindIdentifier:
      return { kind: "identifier", name: sanitizeIdentifier(AsIdentifier(node)!.Text) };
    case KindStringLiteral:
      return { kind: "literal", value: AsStringLiteral(node)!.Text };
    case KindNumericLiteral:
      return { kind: "literal", value: Number(AsNumericLiteral(node)!.Text) };
    case KindTrueKeyword:
      return { kind: "literal", value: true };
    case KindFalseKeyword:
      return { kind: "literal", value: false };
    case KindNullKeyword:
      return { kind: "literal", value: null };
    case KindThisKeyword:
      return { kind: "identifier", name: "this" };
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(node)!;
      return {
        kind: "parenthesized",
        expression: planExpression(expression.Expression!, sourceFile, input, diagnostics),
      };
    }
    case KindArrayLiteralExpression: {
      const expression = AsArrayLiteralExpression(node)!;
      return {
        kind: "array",
        elements: (expression.Elements?.Nodes ?? [])
          .filter((element): element is Node => element !== undefined)
          .map((element) => planExpression(element, sourceFile, input, diagnostics)),
      };
    }
    case KindPropertyAccessExpression: {
      const expression = AsPropertyAccessExpression(node)!;
      return {
        kind: "member",
        receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        name: sanitizeIdentifier(Node_Text(expression.name!)),
      };
    }
    case KindElementAccessExpression: {
      const expression = AsElementAccessExpression(node)!;
      return {
        kind: "element",
        receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        argument: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics),
      };
    }
    case KindCallExpression: {
      const expression = AsCallExpression(node)!;
      return {
        kind: "call",
        callee: planExpression(expression.Expression!, sourceFile, input, diagnostics),
        arguments: (expression.Arguments?.Nodes ?? []).map((argument): CsharpArgument => ({
          expression: planExpression(argument!, sourceFile, input, diagnostics),
        })),
      };
    }
    case KindNewExpression: {
      const expression = AsNewExpression(node)!;
      return {
        kind: "new",
        type: expressionToCsharpType(expression.Expression, sourceFile, input),
        arguments: (expression.Arguments?.Nodes ?? []).map((argument): CsharpArgument => ({
          expression: planExpression(argument!, sourceFile, input, diagnostics),
        })),
      };
    }
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(node)!;
      return {
        kind: "conditional",
        condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
        whenTrue: planExpression(expression.WhenTrue!, sourceFile, input, diagnostics),
        whenFalse: planExpression(expression.WhenFalse!, sourceFile, input, diagnostics),
      };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(node)!;
      const operator = getCsharpPrefixUnaryOperator(expression.Operator);
      if (operator === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Prefix unary operator is outside the current C# planning surface."));
        return { kind: "identifier", name: "__unsupported" };
      }
      return {
        kind: "prefixUnary",
        operator,
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
      };
    }
    case KindPostfixUnaryExpression: {
      const expression = AsPostfixUnaryExpression(node)!;
      const operator = getCsharpPostfixUnaryOperator(expression.Operator);
      if (operator === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Postfix unary operator is outside the current C# planning surface."));
        return { kind: "identifier", name: "__unsupported" };
      }
      return {
        kind: "postfixUnary",
        operand: planExpression(expression.Operand!, sourceFile, input, diagnostics),
        operator,
      };
    }
    default: {
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics);
      if (binary !== undefined) {
        return binary;
      }
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return { kind: "identifier", name: "__unsupported" };
    }
  }
}

function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const operator = getCsharpBinaryOperator(node);
  if (operator === undefined) {
    return undefined;
  }
  const expression = AsBinaryExpression(node)!;
  return {
    kind: "binary",
    left: planExpression(expression.Left!, sourceFile, input, diagnostics),
    operator,
    right: planExpression(expression.Right!, sourceFile, input, diagnostics),
  };
}

function getCsharpBinaryOperator(node: Node): string | undefined {
  if (node.Kind === KindBinaryExpression) {
    const operatorKind = AsBinaryExpression(node)!.OperatorToken?.Kind;
    switch (operatorKind) {
      case KindPlusToken:
        return "+";
      case KindMinusToken:
        return "-";
      case KindAsteriskToken:
        return "*";
      case KindSlashToken:
        return "/";
      case KindPercentToken:
        return "%";
      case KindQuestionQuestionToken:
        return "??";
      case KindEqualsToken:
        return "=";
      case KindEqualsEqualsToken:
      case KindEqualsEqualsEqualsToken:
        return "==";
      case KindExclamationEqualsToken:
      case KindExclamationEqualsEqualsToken:
        return "!=";
      case KindLessThanToken:
        return "<";
      case KindLessThanEqualsToken:
        return "<=";
      case KindGreaterThanToken:
        return ">";
      case KindGreaterThanEqualsToken:
        return ">=";
      case KindAmpersandAmpersandToken:
        return "&&";
      case KindBarBarToken:
        return "||";
      default:
        return undefined;
    }
  }
  return undefined;
}

function getCsharpPrefixUnaryOperator(kind: number): string | undefined {
  switch (kind) {
    case KindPlusToken:
      return "+";
    case KindMinusToken:
      return "-";
    case KindExclamationToken:
      return "!";
    case KindPlusPlusToken:
      return "++";
    case KindMinusMinusToken:
      return "--";
    default:
      return undefined;
  }
}

function getCsharpPostfixUnaryOperator(kind: number): string | undefined {
  switch (kind) {
    case KindPlusPlusToken:
      return "++";
    case KindMinusMinusToken:
      return "--";
    default:
      return undefined;
  }
}
