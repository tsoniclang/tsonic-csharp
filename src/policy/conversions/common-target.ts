import { conversionIsImplicitlyApplicable, selectCsharpConversion } from "./core.js";

import { targetTypeRefEquals } from "../../target-model/types/index.js";
import type { CsharpConversionTargetPreference } from "../../target-model/conversions/selection.js";
import type { CsharpPolicyContext } from "../model/context.js";
import type { TargetTypeRef } from "../types/index.js";

export function compareCsharpImplicitConversionTargets(
  input: Pick<
    CsharpPolicyContext,
    "projectTypes" | "providers" | "target"
  >,
  left: TargetTypeRef,
  right: TargetTypeRef,
): CsharpConversionTargetPreference {
  if (targetTypeRefEquals(left, right)) {
    return "equivalent";
  }
  const leftToRight = conversionIsImplicitlyApplicable(
    selectCsharpConversion(input, left, right, "implicit"),
  );
  const rightToLeft = conversionIsImplicitlyApplicable(
    selectCsharpConversion(input, right, left, "implicit"),
  );
  if (leftToRight === rightToLeft) {
    return leftToRight ? "equivalent" : "incomparable";
  }
  return leftToRight ? "left" : "right";
}
