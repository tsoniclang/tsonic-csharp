import type { CsharpPlanningContext } from "../../context.js";
import {
  AsIdentifier,
  KindIdentifier,
  KindNullKeyword,
  KindVoidExpression,
  Node_Text,
  SourceKind,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpBinaryOperatorToken, CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import type {
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import {
  csharpIntegralConstantNegation,
  csharpIntegralConstantOperation,
  csharpUnsuffixedIntegralLiteral,
  type CsharpIntegralConstant,
} from "../../../../target-model/syntax/numeric-literals.js";
import { planVoidExpression } from "../expression-void.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { planCsharpExpressionCompletion } from "../planned-value-composition.js";

export function planBinaryOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType: CsharpTypeNode | undefined,
  expectedTargetType: TargetTypeRef,
): CsharpPlannedValue | undefined {
  if (SourceKind(input.program.source.ast, operand) === KindVoidExpression &&
    (operatorToken.kind === "EqualsEqualsToken" || operatorToken.kind === "ExclamationEqualsToken")) {
    return planVoidExpression(operand, sourceFile, input, diagnostics, planExpression, expectedTargetType);
  }
  if (isNullishEqualityOperand(operand, operatorToken, sourceFile, input)) {
    return planCsharpExpressionCompletion(operand, sourceFile, input, diagnostics,
      { kind: "LiteralExpression", value: null }, expectedTargetType);
  }
  return expectedType === undefined
    ? planExpression(operand, sourceFile, input, diagnostics)
    : planExpressionWithExpectedType(
        operand,
        sourceFile,
        input,
        diagnostics,
        expectedType,
        undefined,
        expectedTargetType,
      );
}

export function isCsharpFloat64Operand(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && type.name === "float64";
}

export function csharpFloat64BinaryNeedsFloatingLiteral(
  operatorToken: CsharpBinaryOperatorToken,
  left: CsharpExpression,
  right: CsharpExpression,
): boolean {
  const operator = arithmeticOperator(operatorToken);
  const leftConstant = operator === undefined ? undefined : integralConstantOperand(left);
  const rightConstant = operator === undefined ? undefined : integralConstantOperand(right);
  if (operator === undefined || leftConstant === undefined || rightConstant === undefined) return false;
  const outcome = csharpIntegralConstantOperation(operator, leftConstant, rightConstant);
  return outcome === undefined ||
    !Object.is(Number(outcome.value), floatingOperation(operator, leftConstant.intended, rightConstant.intended));
}

export function csharpFloat64NegationNeedsFloatingLiteral(operand: CsharpExpression): boolean {
  const constant = integralConstantOperand(operand);
  if (constant === undefined) return false;
  const negated = csharpIntegralConstantNegation(constant);
  return negated === undefined || !Object.is(Number(negated.value), -constant.intended);
}

export function csharpFloat64LiteralOperand(expression: CsharpExpression): CsharpExpression {
  switch (expression.kind) {
    case "ParenthesizedExpression":
      return { ...expression, expression: csharpFloat64LiteralOperand(expression.expression) };
    case "PrefixUnaryExpression":
      return { ...expression, operand: csharpFloat64LiteralOperand(expression.operand) };
    case "BinaryExpression":
      return { ...expression, left: csharpFloat64LiteralOperand(expression.left) };
    case "LiteralExpression":
    case "NumericLiteralExpression":
      return typeof expression.value === "number" ? { kind: "NumericLiteralExpression", value: expression.value, suffix: "D" } : expression;
    default:
      return expression;
  }
}

interface PlannedIntegralConstant extends CsharpIntegralConstant {
  readonly intended: number;
}

function integralConstantOperand(expression: CsharpExpression): PlannedIntegralConstant | undefined {
  switch (expression.kind) {
    case "ParenthesizedExpression":
      return integralConstantOperand(expression.expression);
    case "PrefixUnaryExpression": {
      const sign = expression.operatorToken.kind;
      const operand = sign === "MinusToken" || sign === "PlusToken" ? integralConstantOperand(expression.operand) : undefined;
      if (operand === undefined || sign === "PlusToken") return operand;
      const literalOperand = expression.operand.kind === "LiteralExpression" || expression.operand.kind === "NumericLiteralExpression";
      const negated = literalOperand && operand.value === 2147483648n
        ? { value: -2147483648n, kind: "int32" as const }
        : csharpIntegralConstantNegation(operand);
      return negated === undefined ? undefined : { ...negated, intended: -operand.intended };
    }
    case "BinaryExpression": {
      const operator = arithmeticOperator(expression.operatorToken);
      const left = operator === undefined ? undefined : integralConstantOperand(expression.left);
      const right = operator === undefined ? undefined : integralConstantOperand(expression.right);
      const outcome = operator === undefined || left === undefined || right === undefined
        ? undefined : csharpIntegralConstantOperation(operator, left, right);
      return outcome === undefined ? undefined : { ...outcome, intended: Number(outcome.value) };
    }
    case "LiteralExpression":
    case "NumericLiteralExpression": {
      const value = expression.value;
      if (typeof value !== "number" || expression.kind === "NumericLiteralExpression" && expression.suffix !== undefined) {
        return undefined;
      }
      const literal = csharpUnsuffixedIntegralLiteral(value);
      return literal === undefined ? undefined : { ...literal, intended: value };
    }
    default:
      return undefined;
  }
}

function arithmeticOperator(token: CsharpBinaryOperatorToken): "+" | "-" | "*" | "/" | "%" | undefined {
  switch (token.kind) {
    case "PlusToken":
      return "+";
    case "MinusToken":
      return "-";
    case "AsteriskToken":
      return "*";
    case "SlashToken":
      return "/";
    case "PercentToken":
      return "%";
    default:
      return undefined;
  }
}

function floatingOperation(operator: "+" | "-" | "*" | "/" | "%", left: number, right: number): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "%":
      return left % right;
  }
}

function isNullishEqualityOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): boolean {
  if (operatorToken.kind !== "EqualsEqualsToken" && operatorToken.kind !== "ExclamationEqualsToken") {
    return false;
  }
  const kind = SourceKind(input.program.source.ast, operand);
  if (kind === KindNullKeyword) {
    return true;
  }
  if (kind !== KindIdentifier || Node_Text(input.program.source.ast, AsIdentifier(input.program.source.ast, operand)) !== "undefined") {
    return false;
  }
  const type = input.program.records.expressionType.get(operand);
  return type !== undefined &&
    input.program.records.semanticType.get(type, sourceFile)?.nullish === true;
}
