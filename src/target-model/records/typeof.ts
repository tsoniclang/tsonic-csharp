import type { CsharpTypeofRuntimeKind, TargetTypeRef } from "../types/model.js";
import type { CsharpTypeofResult } from "../types/runtime-kind.js";

export type CsharpTypeofComparisonSelection =
  | {
      readonly kind: "constant";
      readonly value: boolean;
    }
  | {
      readonly kind: "runtime-category-test";
      readonly sourceCarrier: TargetTypeRef;
      readonly category: CsharpTypeofResult;
      readonly runtimeKind: CsharpTypeofRuntimeKind;
      readonly negated: boolean;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };
