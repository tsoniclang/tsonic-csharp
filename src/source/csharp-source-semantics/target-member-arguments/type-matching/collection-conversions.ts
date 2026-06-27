import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLiteralElementTargetType,
} from "../../target-types.js";

export function selectedCollectionImplicitlyConverts(
  expected: TargetTypeRef,
  actual: TargetTypeRef,
  elementAccepts: (expectedElement: TargetTypeRef, actualElement: TargetTypeRef) => boolean,
): boolean {
  if (actual.kind !== "array" || expected.kind !== "target-named") {
    return false;
  }
  const expectedElement = getCsharpArrayLiteralElementTargetType(expected);
  return expectedElement !== undefined &&
    elementAccepts(expectedElement, actual.element);
}
