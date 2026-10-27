import type { TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";

export type CsharpJsStringConversionSelection =
  | { readonly kind: "not-js-string-conversion" }
  | {
      readonly kind: "resolved";
      readonly sourceValue: Node;
      readonly resultType: TargetTypeRef;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };
