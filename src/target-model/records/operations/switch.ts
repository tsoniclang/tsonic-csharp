import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpResolvedBinaryOperation } from "./operator-selection.js";
import type { Node } from "@tsonic/tsts";
import type { SourceTypeFlowRefusal } from "@tsonic/target-api/source";

export type CsharpSwitchSelection =
  | {
      readonly kind: "native";
      readonly expression: Node;
      readonly type: TargetTypeRef;
      readonly clauses: readonly { readonly node: Node; readonly expression?: Node }[];
    }
  | {
      readonly kind: "ordered";
      readonly expression: Node;
      readonly type: TargetTypeRef;
      readonly clauses: readonly { readonly node: Node; readonly comparison?: CsharpResolvedBinaryOperation }[];
      readonly defaultIndex: number;
    }
  | { readonly kind: "rejected"; readonly reason: string; readonly code: `CSHARP_${string}` }
  /** A case comparison is decided by a Host-refused binder constraint; forwarded unchanged (R5, I7). */
  | { readonly kind: "refused"; readonly refusal: SourceTypeFlowRefusal };
