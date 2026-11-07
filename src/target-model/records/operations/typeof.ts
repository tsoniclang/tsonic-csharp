import type { CsharpTypeofRuntimeKind, TargetTypeRef } from "../../types/model.js";
import type { CsharpTypeofResult } from "../../types/runtime-kind.js";

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
      /** An opaque JS-value operand: the runtime typeof string (TsValue.ApplyDynamicTypeof) is compared (K-2665). */
      readonly kind: "dynamic";
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
      readonly code: `CSHARP_${string}`;
    };
