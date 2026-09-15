import type { SourceTypeRelationship } from "@tsonic/target-api/source";
import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
} from "../../../target-model/types/equality.js";
import { isCsharpEmptyObjectTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";

export function retainCsharpBroadValueCarrier(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return isCsharpJsValueTargetType(authored) && selected !== undefined && isCsharpEmptyObjectTargetType(selected)
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
