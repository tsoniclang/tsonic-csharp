import type { CsharpTypedArrayUpdate } from "../../../target-model/records/storage/typed-array-mutations.js";
import type { Node } from "@tsonic/tsts";

import { csharpUnaryNumericPromotion } from "../numeric/promotion.js";

import type { TargetTypeRef } from "../../../target-model/types/model.js";
export function csharpTypedArrayWriteHasNativeCarriers(
  element: TargetTypeRef | undefined, value: TargetTypeRef | undefined,
): boolean {
  return element !== undefined && value?.kind === "source-primitive" && value.name !== "bool" && value.name !== "char";
}
export function selectCsharpNativeTypedArrayUpdate(
  element: TargetTypeRef, indexType: TargetTypeRef | undefined, receiver: Node, index: Node,
  increment: boolean, prefix: boolean,
): CsharpTypedArrayUpdate | { readonly kind: "rejected"; readonly reason: string } {
  const resultType = csharpUnaryNumericPromotion(element);
  return resultType === undefined || indexType === undefined
    ? { kind: "rejected", reason: "Typed array updates require native numeric storage and index carriers." }
    : { kind: "update-typed-element", receiver, index, indexType, resultType, increment, prefix };
}
