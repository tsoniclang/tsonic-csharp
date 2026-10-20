import type { TargetTypeRef } from "../../../target-model/types/model.js";

import { getCsharpImplicitArrayInputElementTargetType, getCsharpArrayLiteralElementTargetType } from "../../../target-model/types/carriers/collections.js";
export function getCsharpArrayLiteralInputCarrierTargetType(
  expectedType: TargetTypeRef,
  fallbackType: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (expectedType.kind === "tuple") return expectedType;
  const implicitArrayElement =
    getCsharpImplicitArrayInputElementTargetType(expectedType);
  if (implicitArrayElement !== undefined) {
    return Object.freeze({
      kind: "array" as const,
      element: implicitArrayElement,
    });
  }
  return getCsharpArrayLiteralElementTargetType(expectedType) === undefined
    ? fallbackType
    : expectedType;
}
