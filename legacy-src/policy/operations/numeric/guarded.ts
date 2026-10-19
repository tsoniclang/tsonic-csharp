import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { selectCsharpGuardedIntegerConversion } from "../../conversions/integer-refinement.js";
import { selectCsharpNumericCarrierPromotion } from "./promotion.js";

export function selectCsharpGuardedIntegerPromotion(input: CsharpPolicyContext,
  leftNode: Node, rightNode: Node, left: TargetTypeRef, right: TargetTypeRef,
): ReturnType<typeof selectCsharpNumericCarrierPromotion> {
  if (selectCsharpGuardedIntegerConversion(input, leftNode, left, right) !== undefined) {
    return selectCsharpNumericCarrierPromotion(right, right);
  }
  return selectCsharpGuardedIntegerConversion(input, rightNode, right, left) === undefined
    ? undefined : selectCsharpNumericCarrierPromotion(left, left);
}
