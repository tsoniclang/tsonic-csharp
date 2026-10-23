import type { SourceTypeRelationship } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefIsClosed } from "../../../target-model/types/equality.js";
import { isCsharpEmptyObjectTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { csharpBigIntegerTargetType, csharpObjectTargetType, isCsharpIntegralTargetType } from "../../../target-model/types/carriers/scalar-types.js";

export function retainCsharpBroadValueCarrier(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
  selectedSourceIsBroadObject: boolean,
): TargetTypeRef | undefined {
  if (authored === undefined || selected === undefined ||
    (!isCsharpJsValueTargetType(authored) && !targetTypeRefEquals(authored, csharpObjectTargetType()))) return undefined;
  const payload = getCsharpNullableElementTargetType(selected) ?? selected;
  return selectedSourceIsBroadObject && targetTypeRefEquals(payload, csharpObjectTargetType()) ||
    isCsharpEmptyObjectTargetType(payload) || payload.kind === "array" ||
    payload.kind === "tuple" || getCsharpJsArrayElementTargetType(payload) !== undefined
    ? authored : undefined;
}

export function reconcileCsharpSelectedTargetType(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
  sourceRelationship: SourceTypeRelationship,
  selectedSourceIsBroadObject: boolean,
): TargetTypeRef | undefined {
  if (authored === undefined || selected === undefined) {
    return authored ?? selected;
  }
  if (selected.kind === "opaque" && selected.id === "never") return authored;
  if (isCsharpIntegralTargetType(authored) && targetTypeRefEquals(selected, csharpBigIntegerTargetType())) return authored;
  const retained = retainCsharpBroadValueCarrier(authored, selected, selectedSourceIsBroadObject);
  if (retained !== undefined) return retained;
  if (
    targetTypeRefEquals(authored, selected) ||
    sourceRelationship === "identical"
  ) {
    return authored;
  }
  return sourceRelationship === "same-declaration" &&
      targetTypeRefIsClosed(authored)
    ? authored
    : selected;
}
