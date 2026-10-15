import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

const integralTargets = new Set([
  "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int", "native-uint", "char",
]);
const nativeSizedConstantRanges = new Map<string, readonly [bigint, bigint]>([
  ["native-int", [-(1n << 31n), (1n << 31n) - 1n]],
  ["native-uint", [0n, (1n << 32n) - 1n]],
]);
const maximumExactDouble = 1n << 53n;

export function csharpExplicitNumericConstant(
  policy: Pick<CsharpPolicyContext, "ast" | "literalValues">,
  assertedType: (typeNode: Node) => TargetTypeRef | undefined,
  node: Node,
): number | bigint | undefined {
  const datum = policy.literalValues.literalValue.get(node);
  if (datum !== undefined) {
    if (datum.number !== undefined) return Number.isFinite(datum.number) ? datum.number : undefined;
    return datum.integer ?? datum.integerConstant;
  }
  const { ast } = policy;
  if (ast.is.IsParenthesizedExpression(node)) {
    const inner = ast.as.AsParenthesizedExpression(node)?.Expression;
    return inner === undefined ? undefined : csharpExplicitNumericConstant(policy, assertedType, inner);
  }
  if (ast.is.IsSatisfiesExpression(node)) {
    const inner = ast.as.AsSatisfiesExpression(node)?.Expression;
    return inner === undefined ? undefined : csharpExplicitNumericConstant(policy, assertedType, inner);
  }
  const assertion = ast.is.IsAsExpression(node)
    ? ast.as.AsAsExpression(node)
    : ast.is.IsTypeAssertion(node) ? ast.as.AsTypeAssertion(node) : undefined;
  if (assertion?.Expression === undefined || assertion.Type === undefined) return undefined;
  const value = csharpExplicitNumericConstant(policy, assertedType, assertion.Expression);
  if (value === undefined || ast.isConstAssertion(node)) return value;
  const target = assertedType(assertion.Type);
  if (target?.kind !== "source-primitive") return undefined;
  if (integralTargets.has(target.name)) {
    const truncated = typeof value === "bigint" ? value : Number.isFinite(value) ? BigInt(Math.trunc(value)) : undefined;
    const range = nativeSizedConstantRanges.get(target.name);
    return truncated === undefined || range === undefined || truncated >= range[0] && truncated <= range[1] ? truncated : undefined;
  }
  switch (target.name) {
    case "float64":
      return Number(value);
    case "float32":
      return typeof value === "bigint" && (value > maximumExactDouble || value < -maximumExactDouble)
        ? undefined
        : Math.fround(Number(value));
    case "decimal":
      if (typeof value === "bigint") return value;
      return Math.abs(value) < 2 ** 53 ? Number(value.toPrecision(15)) : undefined;
    default:
      return undefined;
  }
}
