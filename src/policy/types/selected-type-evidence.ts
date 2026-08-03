import type {
  SourceTypeRelationship,
} from "@tsonic/target-api";
import type {
  TargetTypeRef,
} from "./definitions.js";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
} from "./equality.js";

export function reconcileCsharpSelectedTargetType(
  authored: TargetTypeRef | undefined,
  selected: TargetTypeRef | undefined,
  sourceRelationship: SourceTypeRelationship,
): TargetTypeRef | undefined {
  if (authored === undefined || selected === undefined) {
    return authored ?? selected;
  }
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
