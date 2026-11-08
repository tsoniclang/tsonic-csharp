import type { ArgumentPassingMode, Node } from "@tsonic/tsts";
import type { CsharpResolvedBinaryOperation } from "../records/operations/operator-selection.js";
import type { TargetTypeRef } from "../types/model.js";

export type CsharpNativeIntegerUse =
  | { readonly kind: "index" | "parameter"; readonly occurrence: Node; readonly type: TargetTypeRef;
      readonly passingMode: ArgumentPassingMode }
  | { readonly kind: "shift-count"; readonly operation: CsharpResolvedBinaryOperation };
