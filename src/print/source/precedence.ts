import type { CsharpExpression } from "../../backend/target-ast/roslyn/index.js";
import { failUnsupportedCsharpSyntax } from "./fail-closed.js";

export function csharpExpressionPrecedence(expression: CsharpExpression): number {
  switch (expression.kind) {
    case "LambdaExpression":
    case "AssignmentExpression":
    case "ThrowExpression": return 1;
    case "ConditionalExpression": return 2;
    case "IsPatternExpression":
    case "NullPatternExpression": return 10;
    case "PrefixUnaryExpression":
    case "AwaitExpression":
    case "CastExpression": return 14;
    case "SwitchExpression": return 15;
    case "BinaryExpression": {
      switch (expression.operatorToken.kind) {
        case "QuestionQuestionToken": return 3;
        case "BarBarToken": return 4;
        case "AmpersandAmpersandToken": return 5;
        case "BarToken": return 6;
        case "CaretToken": return 7;
        case "AmpersandToken": return 8;
        case "EqualsEqualsToken":
        case "ExclamationEqualsToken": return 9;
        case "LessThanToken":
        case "LessThanEqualsToken":
        case "GreaterThanToken":
        case "GreaterThanEqualsToken": return 10;
        case "LessThanLessThanToken":
        case "GreaterThanGreaterThanToken":
        case "GreaterThanGreaterThanGreaterThanToken": return 11;
        case "PlusToken":
        case "MinusToken": return 12;
        case "AsteriskToken":
        case "SlashToken":
        case "PercentToken": return 13;
      }
      return failUnsupportedCsharpSyntax(expression.operatorToken, "binary precedence");
    }
    default: return 16;
  }
}
