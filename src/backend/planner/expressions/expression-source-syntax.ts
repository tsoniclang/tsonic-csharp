import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
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
} from "@tsonic/target-api/source";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  parseBigIntLiteral,
  parseFiniteNumberLiteral,
} from "../../../target-model/syntax/literal-values.js";
import {
  csharpBigIntegerTargetType,
} from "../../../target-model/types/index.js";
import {
  applyCsharpConversionSelection,
  readCsharpExpressionConversionClassification,
} from "./conversions.js";
import {
  planCsharpExactLiteralConversion,
} from "./literal-conversions.js";
import {
  requireCsharpStringRuntimeCarrier,
} from "./expression-literal-carriers.js";
import {
  planCsharpConditionExpression,
} from "./expression-bool-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  probeCarrierFromResolution,
  missingCarrierDiagnosticDetail,
  resolveRuntimeCarrierForExpression,
} from "../types/runtime-carriers.js";
import {
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import {
  planThisExpression,
} from "./expression-this.js";
import { selectCsharpAwaitCompletion } from "../../../target-model/types/await-completions.js";
import { planCsharpAwaitCompletion } from "./await-completions.js";
import { mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion, planCsharpValueBranch } from "./planned-value-composition.js";

export function tryPlanSourceSyntaxExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const value = (expression: CsharpExpression | undefined) => planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression);
  switch (SourceKind(input.program.source.ast, node)) {
    case KindStringLiteral:
      return value({ kind: "LiteralExpression", value: Node_Text(input.program.source.ast, AsStringLiteral(input.program.source.ast, node)) });
    case KindNoSubstitutionTemplateLiteral:
      if (!requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "No-substitution template literal emission")) {
        return undefined;
      }
      return value({ kind: "LiteralExpression", value: Node_Text(input.program.source.ast, AsNoSubstitutionTemplateLiteral(input.program.source.ast, node)) });
    case KindNumericLiteral: {
      const literal = parseFiniteNumberLiteral(Node_Text(input.program.source.ast, AsNumericLiteral(input.program.source.ast, node)));
      if (literal === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Numeric literal emission requires parseable finite source literal text from TSTS."));
        return undefined;
      }
      return value({ kind: "LiteralExpression", value: literal });
    }
    case KindBigIntLiteral: {
      const literal = parseBigIntLiteral(Node_Text(input.program.source.ast, AsBigIntLiteral(input.program.source.ast, node)));
      if (literal === undefined) {
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
      if (!targetTypeRefEquals(carrier, csharpBigIntegerTargetType())) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a finalized System.Numerics.BigInteger runtime carrier fact."));
        return undefined;
      }
      const bigIntegerType = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
      if (bigIntegerType === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "BigInt literal emission requires a renderable System.Numerics.BigInteger target type."));
        return undefined;
      }
      return value({
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: bigIntegerType,
          name: "Parse",
        },
        arguments: [{
          kind: "Argument",
          expression: { kind: "LiteralExpression", value: literal.toString(10) },
        }],
      });
    }
    case KindTrueKeyword:
      return value({ kind: "LiteralExpression", value: true });
    case KindFalseKeyword:
      return value({ kind: "LiteralExpression", value: false });
    case KindNullKeyword:
      return value({ kind: "LiteralExpression", value: null });
    case KindThisKeyword:
      return value(planThisExpression(node, sourceFile, input, diagnostics));
    case KindSuperKeyword:
      return value({ kind: "IdentifierName", name: "base" });
    case KindAsExpression: {
      const assertion = AsAsExpression(input.program.source.ast, node)!;
      return planAssertionExpression(
        node,
        assertion.Expression,
        assertion.Type,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    }
    case KindSatisfiesExpression:
      return planExpression(AsSatisfiesExpression(input.program.source.ast, node)!.Expression!, sourceFile, input, diagnostics);
    case KindNonNullExpression: {
      const expression = AsNonNullExpression(input.program.source.ast, node)!.Expression;
      return planAssertionExpression(
        node,
        expression,
        node,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    }
    case KindTypeAssertionExpression: {
      const assertion = AsTypeAssertion(input.program.source.ast, node)!;
      return planAssertionExpression(
        node,
        assertion.Expression,
        assertion.Type,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    }
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(input.program.source.ast, node)!;
      const inner = planExpression(expression.Expression!, sourceFile, input, diagnostics);
      if (inner === undefined) {
        return undefined;
      }
      return mapCsharpPlannedValue(inner, inner.completion.carrier, expression => ({ kind: "ParenthesizedExpression", expression }));
    }
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(input.program.source.ast, node)!;
      if (expression.Expression === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Await expression must have an expression."));
        return undefined;
      }
      const awaitedCarrierResolution = resolveRuntimeCarrierForExpression(input, expression.Expression, sourceFile);
      const awaitedCarrier = probeCarrierFromResolution(awaitedCarrierResolution);
      const completion = selectCsharpAwaitCompletion(awaitedCarrier, input.program.typeDefinitions);
      const awaitedResultCarrier = completion?.result;
      if (awaitedCarrier === undefined || completion === undefined || awaitedResultCarrier === undefined) {
        const detail = missingCarrierDiagnosticDetail(awaitedCarrierResolution, "Runtime carrier fact is missing for the awaited expression.");
        diagnostics.push(unsupportedNodeDiagnostic(node, `Await expression emission requires a finalized Promise/Task target carrier fact for the awaited expression. ${detail.reason}`, detail.evidence));
        return undefined;
      }
      const awaitCarrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
      const awaitCarrier = probeCarrierFromResolution(awaitCarrierResolution);
      if (
        awaitCarrier === undefined ||
        !targetTypeRefEquals(awaitCarrier, awaitedResultCarrier)
      ) {
        const detail = missingCarrierDiagnosticDetail(awaitCarrierResolution, "Runtime carrier fact is missing for the await expression result.");
        diagnostics.push(unsupportedNodeDiagnostic(node, `Await expression emission requires the finalized await-result carrier to match the awaited Promise/Task result carrier. ${detail.reason}`, detail.evidence));
        return undefined;
      }
      const awaited = planExpression(expression.Expression, sourceFile, input, diagnostics);
      if (awaited === undefined) {
        return undefined;
      }
      return planCsharpAwaitCompletion(node, awaitedCarrier, completion, awaited, input, diagnostics);
    }
    case KindConditionalExpression: {
      const expression = AsConditionalExpression(input.program.source.ast, node)!;
      if (expression.Condition === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Conditional expression requires a condition expression."));
        return undefined;
      }
      const condition = planCsharpConditionExpression(
        expression.Condition,
        "Conditional expression condition",
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
      const whenTrue = planExpression(expression.WhenTrue!, sourceFile, input, diagnostics);
      const whenFalse = planExpression(expression.WhenFalse!, sourceFile, input, diagnostics);
      if (condition === undefined || whenTrue === undefined || whenFalse === undefined) {
        return undefined;
      }
      return planCsharpValueBranch(node, sourceFile, input, diagnostics, condition, whenTrue, whenFalse);
    }
    default:
      return undefined;
  }
}

function planAssertionExpression(
  node: Node,
  expressionNode: Node | undefined,
  targetTypeNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (expressionNode === undefined || targetTypeNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# assertion translation requires exact expression and target type syntax.",
    ));
    return undefined;
  }
  if (input.program.source.ast.isConstAssertion(node)) {
    return planExpression(expressionNode, sourceFile, input, diagnostics);
  }
  const sourceType = input.types.classifications.resolveNode(expressionNode, sourceFile);
  const targetType = input.types.classifications.resolveNode(targetTypeNode, sourceFile);
  const selection = readCsharpExpressionConversionClassification(
    expressionNode,
    input,
    diagnostics,
    sourceType,
    targetType,
    "explicit",
  );
  if (selection === undefined) {
    return undefined;
  }
  if (selection.kind === "implicit" && selection.proof === "literal") {
    const literal = planCsharpExactLiteralConversion(
      input,
      expressionNode,
      targetType,
    );
    if (literal.kind === "resolved") {
      return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, literal.expression, targetType);
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      expressionNode,
      literal.kind === "rejected"
        ? literal.reason
        : "A selected C# assertion-literal conversion requires an exact target literal representation.",
    ));
    return undefined;
  }
  if (targetType === undefined) return undefined;
  return mapCsharpPlannedValue(planExpression(expressionNode, sourceFile, input, diagnostics), targetType, expression =>
    applyCsharpConversionSelection(expressionNode, sourceFile, input, diagnostics, sourceType, targetType, selection, expression));
}
