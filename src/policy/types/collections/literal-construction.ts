import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { getCsharpArrayLiteralElementTargetType, getCsharpArrayLiteralInputCarrierTargetType } from "../../../target-model/types/collections.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function selectCsharpArrayLiteralCarrier(
  expected: TargetTypeRef,
  source: TargetTypeRef | undefined,
  definitions?: CsharpTypeDefinitions,
): TargetTypeRef | undefined {
  const value = getCsharpNullableElementTargetType(expected) ?? expected;
  const arms = getCsharpRuntimeUnionArms(value, definitions);
  if (arms === undefined) return getCsharpArrayLiteralInputCarrierTargetType(value, source);
  const candidates = arms.filter(arm => arm.kind === "tuple" || getCsharpArrayLiteralElementTargetType(arm) !== undefined);
  const exact = source === undefined ? [] : candidates.filter(arm => targetTypeRefEquals(arm, source));
  return exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : undefined;
}
