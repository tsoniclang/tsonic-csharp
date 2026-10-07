import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";

export type CsharpSourceCalleeSelection =
  | { readonly kind: "function"; readonly expression: Node; readonly declaration: Node }
  | { readonly kind: "method"; readonly expression: Node; readonly declaration: Node;
      readonly receiver: { readonly expression: Node; readonly type: TargetTypeRef } }
  | { readonly kind: "union-method"; readonly expression: Node;
      readonly receiver: { readonly expression: Node; readonly type: TargetTypeRef } }
  | { readonly kind: "value"; readonly expression: Node; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };
