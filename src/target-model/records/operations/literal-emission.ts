import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpExactLiteralRecipe } from "../../conversions/exact-literals.js";

export type CsharpLiteralEmission =
  // integralToken: print the authored integer token without the D suffix (decision 4, C-2314); set only by the
  // literal admission producer when C# target-types this literal to an exact double destination.
  | { readonly kind: "float64"; readonly value: number; readonly integralToken?: true }
  | { readonly kind: "exact"; readonly recipe: CsharpExactLiteralRecipe; readonly integralToken?: true }
  /** A bigint literal is parsed from its exact decimal text by its BigInteger carrier (`BigInteger.Parse("6")`). */
  | { readonly kind: "bigint"; readonly carrier: TargetTypeRef; readonly decimal: string };

export interface CsharpLiteralEmissionRecords {
  readonly literalEmission: { readonly get: (node: Node) => CsharpLiteralEmission | undefined };
}
