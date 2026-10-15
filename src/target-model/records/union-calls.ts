import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export type CsharpUnionCallClassification =
  | { readonly kind: "not-union" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly receiver: Node;
      readonly receiverType: TargetTypeRef;
      readonly resultType: TargetTypeRef;
      readonly parameterTypes: readonly TargetTypeRef[];
      readonly methods: readonly { readonly arm: TargetTypeRef; readonly declaration: Node; readonly targetName: string }[];
    };
