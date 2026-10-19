import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export type CsharpElementDeletionSelection =
  | { readonly kind: "resolved"; readonly receiver: Node; readonly index: Node;
      readonly keyType: TargetTypeRef; readonly targetMemberName: string }
  | { readonly kind: "rejected"; readonly reason: string };
