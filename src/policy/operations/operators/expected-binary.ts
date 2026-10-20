import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { selectCsharpBinaryOperation } from "../../../analysis/operations/operators.js";

type CsharpExpectedBinarySelection = ReturnType<typeof selectCsharpBinaryOperation> | undefined;

export function admitCsharpExpectedBinarySelection(
  targetType: TargetTypeRef,
  contextual: CsharpExpectedBinarySelection,
  baseline: CsharpExpectedBinarySelection,
): CsharpExpectedBinarySelection {
  return contextual?.kind === "resolved" && targetTypeRefEquals(contextual.resultType, targetType) ? contextual : baseline;
}
