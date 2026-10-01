import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpUnionPathStep } from "../../../target-model/types/union-relations.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./union-access.js";

export function planCsharpUnionPattern(
  expression: CsharpExpression,
  path: readonly CsharpUnionPathStep[],
  source?: TargetTypeRef,
  retainsAbsence = false,
): { readonly value: CsharpExpression; readonly condition?: CsharpExpression } {
  let value = expression;
  let condition: CsharpExpression | undefined;
  for (const [depth, step] of path.entries()) {
    const carrier = depth === 0 ? source ?? step.union : step.union;
    const test = runtimeUnionArmTest(value, step.index, carrier);
    condition = condition === undefined ? test : { kind: "BinaryExpression", left: condition,
      operatorToken: { kind: "AmpersandAmpersandToken" }, right: test };
    value = runtimeUnionArmProjection(value, step.index, carrier, retainsAbsence);
  }
  return { value, ...(condition === undefined ? {} : { condition }) };
}
