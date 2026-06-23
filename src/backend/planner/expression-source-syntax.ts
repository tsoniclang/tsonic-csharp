import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import {
  AsAsExpression,
  AsAwaitExpression,
  AsConditionalExpression,
  AsNoSubstitutionTemplateLiteral,
  AsNonNullExpression,
  AsNumericLiteral,
  AsParenthesizedExpression,
  AsSatisfiesExpression,
  AsStringLiteral,
  AsTypeAssertion,
  KindAsExpression,
  KindAwaitExpression,
  KindConditionalExpression,
  KindFalseKeyword,
  KindNoSubstitutionTemplateLiteral,
  KindNonNullExpression,
  KindNullKeyword,
  KindNumericLiteral,
  KindParenthesizedExpression,
  KindSatisfiesExpression,
  KindStringLiteral,
  KindSuperKeyword,
  KindThisKeyword,
  KindTrueKeyword,
  KindTypeAssertionExpression,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";

export function tryPlanSourceSyntaxExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  switch (SourceKind(input.ast, node)) {
    case KindStringLiteral:
      return { kind: "LiteralExpression", value: Node_Text(AsStringLiteral(node)) };
    case KindNoSubstitutionTemplateLiteral:
      return { kind: "LiteralExpression", value: Node_Text(AsNoSubstitutionTemplateLiteral(node)) };
    case KindNumericLiteral: {
      const value = parseFiniteNumberLiteral(Node_Text(AsNumericLiteral(node)));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Numeric literal emission requires parseable finite source literal text from TSTS."));
        return invalidExpression("invalid numeric literal");
      }
      return { kind: "LiteralExpression", value };
    }
    case KindTrueKeyword:
      return { kind: "LiteralExpression", value: true };
    case KindFalseKeyword:
      return { kind: "LiteralExpression", value: false };
    case KindNullKeyword:
      return { kind: "LiteralExpression", value: null };
    case KindThisKeyword:
      return { kind: "IdentifierName", name: "this" };
    case KindSuperKeyword:
      return { kind: "IdentifierName", name: "base" };
    case KindAsExpression:
      return planExpression(AsAsExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindSatisfiesExpression:
      return planExpression(AsSatisfiesExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindNonNullExpression:
      return planExpression(AsNonNullExpression(node)!.Expression!, sourceFile, input, diagnostics);
    case KindTypeAssertionExpression:
      return planExpression(AsTypeAssertion(node)!.Expression!, sourceFile, input, diagnostics);
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(node)!;
      return {
        kind: "ParenthesizedExpression",
        expression: planExpression(expression.Expression!, sourceFile, input, diagnostics),
      };
    }
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(node)!;
      if (expression.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression must have an expression."));
        return invalidExpression("await without expression");
      }
      return {
        kind: "AwaitExpression",
        expression: planExpression(expression.Expression, sourceFile, input, diagnostics),
      };
    }
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(node)!;
      return {
        kind: "ConditionalExpression",
        condition: planExpression(expression.Condition!, sourceFile, input, diagnostics),
        whenTrue: planExpression(expression.WhenTrue!, sourceFile, input, diagnostics),
        whenFalse: planExpression(expression.WhenFalse!, sourceFile, input, diagnostics),
      };
    }
    default:
      return undefined;
  }
}
