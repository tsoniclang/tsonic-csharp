import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export type CsharpCatchBinding =
  | { readonly kind: "unbound" }
  | { readonly kind: "native" | "closed-value"; readonly declaration: Node; readonly name: Node; readonly carrier: TargetTypeRef };
