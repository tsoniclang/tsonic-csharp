import type { SourceTypeRelationship } from "@tsonic/target-api/source";
import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
} from "../../../target-model/types/equality.js";
import { isCsharpEmptyObjectTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/collections.js";

export function retainCsharpBroadValueCarrier(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (!isCsharpJsValueTargetType(authored) || selected === undefined) return undefined;
  const payload = getCsharpNullableElementTargetType(selected) ?? selected;
  return isCsharpEmptyObjectTargetType(payload) || payload.kind === "array" ||
    payload.kind === "tuple" || getCsharpJsArrayElementTargetType(payload) !== undefined
    ? authored : undefined;
}

export function reconcileCsharpSelectedTargetType(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
  sourceRelationship: SourceTypeRelationship,
): TargetTypeRef | undefined {
  if (authored === undefined || selected === undefined) {
    return authored ?? selected;
  }
  if (selected.kind === "opaque" && selected.id === "never") return authored;
  const retained = retainCsharpBroadValueCarrier(authored, selected);
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
