import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { selectCsharpCommonReadOnlySequenceTarget } from "../../conversions/selection/common-target.js";

export function selectCsharpNullishSequenceTarget(
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers" | "target">,
  left: TargetTypeRef,
  right: TargetTypeRef,
): TargetTypeRef | undefined {
  const leftValue = getCsharpNullableElementTargetType(left) ?? left;
  const rightValue = getCsharpNullableElementTargetType(right);
  const common = selectCsharpCommonReadOnlySequenceTarget(input, [leftValue, rightValue ?? right]);
  return common === undefined ? undefined : rightValue === undefined ? common : csharpNullableTargetType(common);
}
