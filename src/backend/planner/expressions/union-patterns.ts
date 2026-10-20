import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpUnionPathStep } from "../../../target-model/types/union-relations.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "./union-access.js";
import type { CsharpPlanningContext } from "../context.js";

export function planCsharpUnionPattern(
  expression: CsharpExpression,
  path: readonly CsharpUnionPathStep[],
  source: TargetTypeRef | undefined,
  retainsAbsence: boolean,
  input: CsharpPlanningContext,
): { readonly value: CsharpExpression; readonly condition?: CsharpExpression } {
  let value = expression;
  let condition: CsharpExpression | undefined;
  for (const [depth, step] of path.entries()) {
    const carrier = depth === 0 ? source ?? step.union : step.union;
    const test = runtimeUnionArmTest(value, step.index, carrier, input);
    condition = condition === undefined ? test : { kind: "BinaryExpression", left: condition,
      operatorToken: { kind: "AmpersandAmpersandToken" }, right: test };
    value = runtimeUnionArmProjection(value, step.index, carrier, retainsAbsence, input);
  }
  return { value, ...(condition === undefined ? {} : { condition }) };
}
