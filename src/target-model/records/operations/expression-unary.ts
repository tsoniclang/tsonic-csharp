import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpExactLiteralRecipe } from "../../conversions/exact-literals.js";
import type { CsharpJsValueInvocation } from "../../operations/js-values.js";

export type CsharpUnaryEmission =
  | { readonly kind: "literal"; readonly carrier: TargetTypeRef; readonly recipe: CsharpExactLiteralRecipe }
  | { readonly kind: "js-value"; readonly operand: Node; readonly invocation: CsharpJsValueInvocation }
  | { readonly kind: "native"; readonly operand: Node; readonly carrier: TargetTypeRef; readonly operator: string;
      readonly postfix: boolean; readonly storage: Node | undefined };

export interface CsharpUnaryEmissionRecords {
  readonly unaryEmission: { readonly get: (node: Node) => CsharpUnaryEmission | undefined };
}
