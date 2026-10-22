import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpExactLiteralRecipe } from "../conversions/exact-literals.js";

export type CsharpLiteralEmission =
  | { readonly kind: "float64"; readonly value: number }
  | { readonly kind: "exact"; readonly recipe: CsharpExactLiteralRecipe }
  /** A bigint literal is parsed from its exact decimal text by its BigInteger carrier (`BigInteger.Parse("6")`). */
  | { readonly kind: "bigint"; readonly carrier: TargetTypeRef; readonly decimal: string };

export interface CsharpLiteralEmissionRecords {
  readonly literalEmission: { readonly get: (node: Node) => CsharpLiteralEmission | undefined };
}
