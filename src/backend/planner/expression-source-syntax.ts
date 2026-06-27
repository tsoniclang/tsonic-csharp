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
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  getCsharpTaskResultTargetType,
  csharpVoidTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

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
        return undefined;
      }
      return { kind: "LiteralExpression", value: Node_Text(AsNoSubstitutionTemplateLiteral(node)) };
    case KindNumericLiteral: {
      const value = parseFiniteNumberLiteral(Node_Text(AsNumericLiteral(node)));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Numeric literal emission requires parseable finite source literal text from TSTS."));
        return undefined;
      }
      return { kind: "LiteralExpression", value };
    }
    case KindBigIntLiteral: {
      const value = parseBigIntLiteral(Node_Text(AsBigIntLiteral(node)));
      if (value === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires parseable source literal text from TSTS."));
        return undefined;
      }
      const carrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
      const carrier = probeCarrierFromResolution(carrierResolution);
      if (carrier === undefined) {
        const detail = missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the BigInt literal.");
        diagnostics.push(unsupportedNodeDiagnostic(node, `BigInt literal emission requires a finalized runtime carrier fact before C# emission. ${detail.reason}`, detail.evidence));
        return undefined;
      }
      if (!targetTypeRefsMatch(carrier, csharpBigIntegerTargetType())) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a finalized System.Numerics.BigInteger runtime carrier fact."));
        return undefined;
      }
      const bigIntegerType = csharpTypeFromTargetTypeRef(carrier);
      if (bigIntegerType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a renderable System.Numerics.BigInteger target type."));
        return undefined;
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
      const inner = planExpression(expression.Expression!, sourceFile, input, diagnostics);
      if (inner === undefined) {
        return undefined;
      }
      return {
        kind: "ParenthesizedExpression",
        expression: inner,
      };
    }
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(node)!;
      if (expression.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression must have an expression."));
        return undefined;
      }
      const awaitedCarrierResolution = resolveRuntimeCarrierForExpression(input, expression.Expression, sourceFile);
      const awaitedCarrier = probeCarrierFromResolution(awaitedCarrierResolution);
      const awaitedResultCarrier = getCsharpTaskResultTargetType(awaitedCarrier);
      if (awaitedResultCarrier === undefined) {
        const detail = missingCarrierDiagnosticDetail(awaitedCarrierResolution, "Runtime carrier fact is missing for the awaited expression.");
        diagnostics.push(unsupportedNodeDiagnostic(node, `Await expression emission requires a finalized Promise/Task target carrier fact for the awaited expression. ${detail.reason}`, detail.evidence));
        return undefined;
      }
      const awaitCarrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
      const awaitCarrier = probeCarrierFromResolution(awaitCarrierResolution);
      if (
        awaitCarrier === undefined
          ? !targetTypeRefsMatch(awaitedResultCarrier, csharpVoidTargetType())
          : !targetTypeRefsMatch(awaitCarrier, awaitedResultCarrier)
      ) {
        const detail = missingCarrierDiagnosticDetail(awaitCarrierResolution, "Runtime carrier fact is missing for the await expression result.");
        diagnostics.push(unsupportedNodeDiagnostic(node, `Await expression emission requires the finalized await-result carrier to match the awaited Promise/Task result carrier. ${detail.reason}`, detail.evidence));
        return undefined;
      }
      const awaited = planExpression(expression.Expression, sourceFile, input, diagnostics);
      if (awaited === undefined) {
        return undefined;
      }
      return {
        kind: "AwaitExpression",
        expression: awaited,
      };
    }
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(node)!;
      const condition = planExpression(expression.Condition!, sourceFile, input, diagnostics);
      const whenTrue = planExpression(expression.WhenTrue!, sourceFile, input, diagnostics);
      const whenFalse = planExpression(expression.WhenFalse!, sourceFile, input, diagnostics);
      if (condition === undefined || whenTrue === undefined || whenFalse === undefined) {
        return undefined;
      }
      return {
        kind: "ConditionalExpression",
        condition,
        whenTrue,
        whenFalse,
      };
    }
    default:
      return undefined;
  }
}
