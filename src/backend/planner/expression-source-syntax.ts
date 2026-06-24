import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import {
  AsAsExpression,
  AsAwaitExpression,
  AsBigIntLiteral,
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
  KindBigIntLiteral,
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
  parseBigIntLiteral,
  parseFiniteNumberLiteral,
} from "../../source/source-literal-values.js";
import {
  csharpBigIntegerTargetType,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  requireCsharpStringRuntimeCarrier,
} from "./expression-literal-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
  targetTypeRefsMatch,
} from "./target-types.js";

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
      if (!requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "No-substitution template literal emission")) {
        return invalidExpression("template literal without target string carrier");
      }
      return { kind: "LiteralExpression", value: Node_Text(AsNoSubstitutionTemplateLiteral(node)) };
    case KindNumericLiteral: {
      const value = parseFiniteNumberLiteral(Node_Text(AsNumericLiteral(node)));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Numeric literal emission requires parseable finite source literal text from TSTS."));
        return invalidExpression("invalid numeric literal");
      }
      return { kind: "LiteralExpression", value };
    }
    case KindBigIntLiteral: {
      const value = parseBigIntLiteral(Node_Text(AsBigIntLiteral(node)));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires parseable source literal text from TSTS."));
        return invalidExpression("invalid bigint literal");
      }
      const carrier = input.facts.getRuntimeCarrierFact(node)?.carrier;
      if (carrier === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a finalized runtime carrier fact before C# emission."));
        return invalidExpression("bigint literal without runtime carrier");
      }
      if (!targetTypeRefsMatch(carrier, csharpBigIntegerTargetType())) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a finalized System.Numerics.BigInteger runtime carrier fact."));
        return invalidExpression("bigint literal without BigInteger carrier");
      }
      const bigIntegerType = csharpTypeFromTargetTypeRef(carrier);
      if (bigIntegerType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a renderable System.Numerics.BigInteger target type."));
        return invalidExpression("bigint literal without renderable target type");
      }
      return {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: bigIntegerType,
          name: "Parse",
        },
        arguments: [{
          kind: "Argument",
          expression: { kind: "LiteralExpression", value: value.toString(10) },
        }],
      };
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
