import type { CsharpIndexedRecordReadPolicyInput } from "../../model/indexed-records.js";
import type { CsharpIndexedRecordRead } from "../../../target-model/records/indexed-records.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/index.js";
import { csharpTargetTypeRenderingRejection } from "../model/renderability.js";

export function selectCsharpIndexedRecordRead(input: CsharpIndexedRecordReadPolicyInput):
  | { readonly kind: "selected"; readonly value: CsharpIndexedRecordRead }
  | { readonly kind: "rejected"; readonly reason: string } {
  if (!input.optional) return { kind: "selected", value: Object.freeze({ kind: "direct" }) };
  if (input.owner === undefined || input.value === undefined) return {
    kind: "rejected", reason: "An optional native record read requires exact receiver and result carriers.",
  };
  const owner = getCsharpNullableElementTargetType(input.owner) ?? input.owner;
  const result = csharpNullableTargetType(input.value);
  if (csharpTargetTypeRenderingRejection(owner) !== undefined || csharpTargetTypeRenderingRejection(result) !== undefined) return {
    kind: "rejected", reason: "An optional native record read requires renderable receiver and result carriers.",
  };
  return { kind: "selected", value: Object.freeze({ kind: "optional", owner, result }) };
}
