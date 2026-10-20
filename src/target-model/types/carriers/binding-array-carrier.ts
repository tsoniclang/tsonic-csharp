import type { TargetTypeRef } from "../model.js";

export type CsharpArrayBindingCarrier =
  | {
      readonly kind: "array";
      readonly carrier: TargetTypeRef;
      readonly element: TargetTypeRef;
      readonly lengthMember: string;
      readonly restSlice:
        | "runtime-array-helper"
        | "instance-slice"
        | "js-array-helper";
      readonly restCarrier: TargetTypeRef;
    }
  | {
      readonly kind: "tuple";
      readonly elements: readonly TargetTypeRef[];
    };
