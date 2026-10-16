import type { Node, SourcePrimitiveKind } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpConversion } from "../../policy/conversions/index.js";
import { selectCsharpExplicitNumericConstantConversion } from "../../policy/conversions/literals.js";
import { csharpBinaryOperationUsesExpectedResultType } from "../../policy/operations/operators/expected-result.js";
import { selectCsharpBinaryOperation } from "../../policy/operations/operators/operator-selection.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation } from "../../target-model/records/operator-selection.js";
import { csharpBigIntFitsSourcePrimitive } from "../../target-model/syntax/numeric-literals.js";
import { sourceOperatorFromKindName, type CsharpSourceOperator } from "../../target-model/syntax/operators.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

type TypeQuery = (node: Node) => TargetTypeRef | undefined;

interface CsharpConstant {
  readonly value: number | bigint;
  readonly type: SourcePrimitiveKind;
}

const integralKinds = new Set<SourcePrimitiveKind>([
  "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int", "native-uint", "char",
]);
const promotedToInt32 = new Set<SourcePrimitiveKind>(["int8", "uint8", "int16", "uint16", "char"]);
const nativeSizedConstantRanges = new Map<string, readonly [bigint, bigint]>([
  ["native-int", [-(1n << 31n), (1n << 31n) - 1n]],
  ["native-uint", [0n, (1n << 32n) - 1n]],
]);
const arithmeticOperators = new Set<CsharpSourceOperator>(["+", "-", "*", "/", "%"]);
const maximumExactDouble = 1n << 53n;
const decimalBound = 2 ** 96;

export function csharpExplicitNumericConstant(
  policy: CsharpPolicyContext,
  typeQuery: TypeQuery,
  node: Node,
): number | bigint | undefined {
  return csharpConstant(policy, typeQuery, node, undefined)?.value;
}

export function csharpExplicitTupleConstantRejection(
  policy: CsharpPolicyContext,
  typeQuery: TypeQuery,
  node: Node,
  target: TargetTypeRef,
): CsharpConversionSelection | undefined {
  const expression = withoutParentheses(policy, node);
  if (expression === undefined || target.kind !== "tuple" || !policy.ast.is.IsArrayLiteralExpression(expression)) return undefined;
  const elements = policy.ast.elements(expression);
  if (elements.length !== target.elements.length) return undefined;
  for (const [index, element] of elements.entries()) {
    const elementTarget = target.elements[index];
    if (element === undefined || elementTarget === undefined) continue;
    const nested = csharpExplicitTupleConstantRejection(policy, typeQuery, element, elementTarget);
    if (nested !== undefined) return nested;
    const constant = csharpExplicitNumericConstant(policy, typeQuery, element);
    const rejection = constant === undefined ? undefined : selectCsharpExplicitNumericConstantConversion(constant, elementTarget);
    if (rejection !== undefined) return rejection;
  }
  return undefined;
}

function csharpConstant(
  policy: CsharpPolicyContext,
  typeQuery: TypeQuery,
  node: Node,
  expected: TargetTypeRef | undefined,
): CsharpConstant | undefined {
  const { ast } = policy;
  const unwrapped = ast.is.IsParenthesizedExpression(node) ? ast.as.AsParenthesizedExpression(node)?.Expression
    : ast.is.IsSatisfiesExpression(node) ? ast.as.AsSatisfiesExpression(node)?.Expression
    : ast.is.IsNonNullExpression(node) ? ast.as.AsNonNullExpression(node)?.Expression
    : node;
  if (unwrapped === undefined) return undefined;
  if (unwrapped !== node) return csharpConstant(policy, typeQuery, unwrapped, expected);
  if (ast.is.IsNumericLiteral(node) || ast.is.IsBigIntLiteral(node)) return literalConstant(policy, typeQuery, node);
  if (ast.is.IsPrefixUnaryExpression(node)) return unaryConstant(policy, typeQuery, node);
  if (ast.is.IsBinaryExpression(node)) return binaryConstant(policy, typeQuery, node, expected);
  const assertion = ast.is.IsAsExpression(node)
    ? ast.as.AsAsExpression(node)
    : ast.is.IsTypeAssertion(node) ? ast.as.AsTypeAssertion(node) : undefined;
  if (assertion?.Expression === undefined || assertion.Type === undefined) return undefined;
  const operand = csharpConstant(policy, typeQuery, assertion.Expression, undefined);
  if (operand === undefined || ast.isConstAssertion(node)) return operand;
  const source = typeQuery(assertion.Expression);
  const target = typeQuery(assertion.Type);
  if (source === undefined || target?.kind !== "source-primitive") return undefined;
  const conversion = selectCsharpConversion(policy, source, target, "explicit");
  if (conversion.kind === "identity" || conversion.kind === "implicit") return operand;
  return conversion.kind === "cast" && conversion.proof === "numeric" ? convertedConstant(operand, target.name) : undefined;
}

function literalConstant(policy: CsharpPolicyContext, typeQuery: TypeQuery, node: Node): CsharpConstant | undefined {
  const datum = policy.literalValues.literalValue.get(node);
  const type = typeQuery(node);
  if (type?.kind === "source-primitive" && integralKinds.has(type.name) && datum?.integer !== undefined) {
    return { value: datum.integer, type: type.name };
  }
  const value = datum?.number;
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const text = String(value);
  if (!Number.isInteger(value) || Object.is(value, -0) || !/^[0-9]+$/u.test(text) || BigInt(text) > (1n << 63n) - 1n) {
    return { value, type: "float64" };
  }
  const integer = BigInt(text);
  return { value: integer, type: integer <= 2147483647n ? "int32" : integer <= 4294967295n ? "uint32" : "int64" };
}

function unaryConstant(policy: CsharpPolicyContext, typeQuery: TypeQuery, node: Node): CsharpConstant | undefined {
  const { ast } = policy;
  const operator = sourceOperatorFromKindName(ast.operatorKindName(node));
  const operandNode = ast.as.AsPrefixUnaryExpression(node)?.Operand;
  if (operandNode === undefined || operator !== "+" && operator !== "-" && operator !== "~") return undefined;
  const operand = csharpConstant(policy, typeQuery, operandNode, undefined);
  if (operand === undefined) return undefined;
  if (!integralKinds.has(operand.type)) {
    return operator === "~" || typeof operand.value !== "number" ? undefined
      : { value: operator === "-" ? -operand.value : operand.value, type: operand.type };
  }
  const value = integralValue(operand);
  if (value === undefined) return undefined;
  const type = promotedToInt32.has(operand.type) ? "int32" : operand.type;
  if (operator === "+") return { value, type };
  if (operator === "~") {
    switch (type) {
      case "int32":
      case "int64":
        return { value: -value - 1n, type };
      case "uint32":
        return { value: (1n << 32n) - 1n - value, type };
      case "uint64":
        return { value: (1n << 64n) - 1n - value, type };
      default:
        return undefined;
    }
  }
  if (value === 2147483648n && ast.is.IsNumericLiteral(operandNode)) return { value: -value, type: "int32" };
  const negatedType = type === "uint32" ? "int64" : type;
  if (negatedType !== "int32" && negatedType !== "int64") return undefined;
  if (csharpBigIntFitsSourcePrimitive(-value, negatedType)) return { value: -value, type: negatedType };
  const result = typeQuery(node);
  return result?.kind === "source-primitive" && result.name === "float64" ? { value: -Number(value), type: "float64" } : undefined;
}

function binaryConstant(
  policy: CsharpPolicyContext,
  typeQuery: TypeQuery,
  node: Node,
  expected: TargetTypeRef | undefined,
): CsharpConstant | undefined {
  const { ast } = policy;
  const operator = sourceOperatorFromKindName(ast.operatorKindName(node));
  const binary = ast.as.AsBinaryExpression(node);
  if (operator === undefined || !arithmeticOperators.has(operator) || binary?.Left === undefined || binary.Right === undefined ||
    !constantShape(policy, binary.Left) || !constantShape(policy, binary.Right)) return undefined;
  const selection = plannedBinarySelection(policy, typeQuery, node, operator, expected);
  if (selection.kind !== "resolved" || selection.targetOperation.kind !== "operator") return undefined;
  const left = csharpConstant(policy, typeQuery, binary.Left, selection.leftInputType);
  const right = csharpConstant(policy, typeQuery, binary.Right, selection.rightInputType);
  if (left === undefined || right === undefined) return undefined;
  const leftInput = primitiveName(selection.leftInputType);
  const rightInput = primitiveName(selection.rightInputType);
  const result = primitiveName(selection.resultType);
  if (leftInput === "float64" && rightInput === "float64") {
    return { value: floatingOperation(operator, Number(left.value), Number(right.value)), type: "float64" };
  }
  if (leftInput === "float32" && rightInput === "float32") {
    const value = Math.fround(floatingOperation(operator, Math.fround(Number(left.value)), Math.fround(Number(right.value))));
    return { value, type: "float32" };
  }
  if (result !== "int32" && result !== "uint32" && result !== "int64" && result !== "uint64") return undefined;
  const leftValue = integralValue(left);
  const rightValue = integralValue(right);
  if (leftValue === undefined || rightValue === undefined || (operator === "/" || operator === "%") && rightValue === 0n) {
    return undefined;
  }
  const value = operator === "+" ? leftValue + rightValue
    : operator === "-" ? leftValue - rightValue
    : operator === "*" ? leftValue * rightValue
    : operator === "/" ? leftValue / rightValue
    : leftValue % rightValue;
  return csharpBigIntFitsSourcePrimitive(value, result) ? { value, type: result } : undefined;
}

function plannedBinarySelection(
  policy: CsharpPolicyContext,
  typeQuery: TypeQuery,
  node: Node,
  operator: CsharpSourceOperator,
  expected: TargetTypeRef | undefined,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  const baseline = selectCsharpBinaryOperation(policy, node, typeQuery);
  const usesExpected = csharpBinaryOperationUsesExpectedResultType(operator);
  if (expected === undefined || baseline.kind === "resolved" && !usesExpected) return baseline;
  const selection = selectCsharpBinaryOperation(policy, node, typeQuery, expected);
  return selection.kind === "resolved" && usesExpected && targetTypeRefEquals(selection.resultType, expected) ? selection : baseline;
}

function constantShape(policy: CsharpPolicyContext, node: Node): boolean {
  const { ast } = policy;
  if (ast.is.IsNumericLiteral(node) || ast.is.IsBigIntLiteral(node)) return true;
  const inner = ast.is.IsParenthesizedExpression(node) ? ast.as.AsParenthesizedExpression(node)?.Expression
    : ast.is.IsSatisfiesExpression(node) ? ast.as.AsSatisfiesExpression(node)?.Expression
    : ast.is.IsNonNullExpression(node) ? ast.as.AsNonNullExpression(node)?.Expression
    : ast.is.IsPrefixUnaryExpression(node) ? ast.as.AsPrefixUnaryExpression(node)?.Operand
    : ast.is.IsAsExpression(node) ? ast.as.AsAsExpression(node)?.Expression
    : ast.is.IsTypeAssertion(node) ? ast.as.AsTypeAssertion(node)?.Expression
    : undefined;
  if (inner !== undefined) return constantShape(policy, inner);
  const binary = ast.is.IsBinaryExpression(node) ? ast.as.AsBinaryExpression(node) : undefined;
  return binary?.Left !== undefined && binary.Right !== undefined &&
    constantShape(policy, binary.Left) && constantShape(policy, binary.Right);
}

function convertedConstant(operand: CsharpConstant, target: SourcePrimitiveKind): CsharpConstant | undefined {
  if (integralKinds.has(target)) {
    const value = integralKinds.has(operand.type) ? integralValue(operand)
      : typeof operand.value === "bigint" ? operand.value
      : Number.isFinite(operand.value) ? BigInt(Math.trunc(operand.value)) : undefined;
    if (value === undefined) return undefined;
    const range = nativeSizedConstantRanges.get(target);
    const fits = target === "char" ? value >= 0n && value <= 65535n
      : range === undefined ? csharpBigIntFitsSourcePrimitive(value, target) : value >= range[0] && value <= range[1];
    return fits ? { value, type: target } : undefined;
  }
  switch (target) {
    case "float64":
      return { value: Number(operand.value), type: "float64" };
    case "float32":
      if (operand.type === "decimal" ||
        typeof operand.value === "bigint" && (operand.value > maximumExactDouble || operand.value < -maximumExactDouble)) {
        return undefined;
      }
      return { value: Math.fround(Number(operand.value)), type: "float32" };
    case "decimal":
      if (integralKinds.has(operand.type) || operand.type === "decimal") {
        return Math.abs(Number(operand.value)) < decimalBound ? { value: operand.value, type: "decimal" } : undefined;
      }
      if (typeof operand.value !== "number" || !Number.isFinite(operand.value) || Math.abs(operand.value) >= decimalBound) {
        return undefined;
      }
      return roundedDecimal(operand.value, operand.type === "float32" ? 7 : 15);
    default:
      return undefined;
  }
}

function roundedDecimal(value: number, digits: number): CsharpConstant | undefined {
  const text = value.toPrecision(digits);
  const rounded = Number(text);
  if (Math.abs(rounded) < 2 ** 53) return { value: rounded, type: "decimal" };
  const parts = /^(-?)([0-9])(?:\.([0-9]+))?e\+([0-9]+)$/u.exec(text);
  if (parts === null) return undefined;
  const fraction = parts[3] ?? "";
  const exponent = Number(parts[4]) - fraction.length;
  if (exponent < 0) return undefined;
  const magnitude = BigInt(`${parts[2]}${fraction}`) * 10n ** BigInt(exponent);
  return { value: parts[1] === "-" ? -magnitude : magnitude, type: "decimal" };
}

function floatingOperation(operator: CsharpSourceOperator, left: number, right: number): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    default:
      return left % right;
  }
}

function integralValue(constant: CsharpConstant): bigint | undefined {
  if (typeof constant.value === "bigint") return constant.value;
  return Number.isInteger(constant.value) ? BigInt(constant.value) : undefined;
}

function primitiveName(type: TargetTypeRef): SourcePrimitiveKind | undefined {
  return type.kind === "source-primitive" ? type.name : undefined;
}

function withoutParentheses(policy: CsharpPolicyContext, node: Node): Node | undefined {
  let current: Node | undefined = node;
  while (current !== undefined && policy.ast.is.IsParenthesizedExpression(current)) {
    current = policy.ast.as.AsParenthesizedExpression(current)?.Expression;
  }
  return current;
}
