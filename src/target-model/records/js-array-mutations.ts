import type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "./typed-array-mutations.js";
import type { Node } from "@tsonic/tsts";

export type CsharpJsArrayMutationSelection =
  | CsharpTypedArrayMutation
  | CsharpTypedArrayUpdate
  | {
      readonly kind: "set-length";
      readonly receiver: Node;
      readonly value: Node;
      readonly targetMemberName: string;
    }
  | {
      readonly kind: "not-js-array-mutation";
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };
