import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpResolvedBinaryOperation } from "./operator-selection.js";
import type { Node } from "@tsonic/tsts";

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
  | { readonly kind: "rejected"; readonly reason: string };
