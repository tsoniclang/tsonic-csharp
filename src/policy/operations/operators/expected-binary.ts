import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation } from "../../../target-model/records/operations/operator-selection.js";

type CsharpExpectedBinarySelection = CsharpOperationSelection<CsharpResolvedBinaryOperation> | undefined;

export function admitCsharpExpectedBinarySelection(
  targetType: TargetTypeRef,
  contextual: CsharpExpectedBinarySelection,
  baseline: CsharpExpectedBinarySelection,
): CsharpExpectedBinarySelection {
  return contextual?.kind === "resolved" && targetTypeRefEquals(contextual.resultType, targetType) ? contextual : baseline;
}
