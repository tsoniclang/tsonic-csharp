import type { AstReader, Node } from "@tsonic/tsts";
import { sourceExpressionSequence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../target-model/types/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, isCsharpNeverTargetType } from "../../../target-model/types/scalar-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export type CsharpShortCircuitBranch = "left" | "right" | "conditional";

export function csharpBooleanShortCircuitBranch(
  ast: AstReader,
  left: Node,
  operator: "&&" | "||",
): CsharpShortCircuitBranch {
  let selected = left;
  for (let depth = 0; depth < 128; depth += 1) {
    const sequence = sourceExpressionSequence(ast, selected);
    const tail = sequence[sequence.length - 1];
    if (tail !== undefined && tail !== selected) { selected = tail; continue; }
    const kind = ast.kindName(selected);
    if (kind === "KindTrueKeyword" || kind === "KindFalseKeyword") {
      return (kind === "KindTrueKeyword") === (operator === "&&") ? "right" : "left";
    }
    const wrapped = ast.is.IsParenthesizedExpression(selected) ? ast.as.AsParenthesizedExpression(selected)?.Expression
      : ast.is.IsAsExpression(selected) ? ast.as.AsAsExpression(selected)?.Expression
      : ast.is.IsTypeAssertion(selected) ? ast.as.AsTypeAssertion(selected)?.Expression
      : ast.is.IsSatisfiesExpression(selected) ? ast.as.AsSatisfiesExpression(selected)?.Expression
      : ast.is.IsNonNullExpression(selected) ? ast.as.AsNonNullExpression(selected)?.Expression : undefined;
    if (wrapped === undefined) break;
    selected = wrapped;
  }
  return "conditional";
}

export function resolveCsharpShortCircuitResult(
  ast: AstReader,
  operator: "&&" | "||",
  leftNode: Node | undefined,
  left: TargetTypeRef,
  right: TargetTypeRef,
): TargetTypeRef | undefined {
  const boolean = csharpSourcePrimitiveTargetType("bool");
  if (!targetTypeRefEquals(left, boolean) || leftNode === undefined) return undefined;
  const branch = csharpBooleanShortCircuitBranch(ast, leftNode, operator);
  return branch === "left" ? left : branch === "right" ? right
    : isCsharpNeverTargetType(right) ? left : combineCsharpTargetUnionMembers([left, right]);
}
