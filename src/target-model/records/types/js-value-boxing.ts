import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpExactLiteralRecipe } from "../../conversions/exact-literals.js";

export type CsharpJsValueBoxing =
  | { readonly kind: "identity" }
  | { readonly kind: "literal"; readonly recipe: CsharpExactLiteralRecipe }
  | { readonly kind: "cast"; readonly carrier: TargetTypeRef }
  | { readonly kind: "wrap" };
export interface CsharpJsValueBoxingRecords {
  readonly jsValueBoxing: { readonly get: (node: Node, carrier: TargetTypeRef) => CsharpJsValueBoxing | undefined };
}
