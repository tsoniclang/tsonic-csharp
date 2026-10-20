import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpExactLiteralRecipe } from "../conversions/exact-literals.js";

export type CsharpLiteralEmission =
  | { readonly kind: "float64"; readonly value: number }
  | { readonly kind: "exact"; readonly recipe: CsharpExactLiteralRecipe }
  | { readonly kind: "bigint"; readonly carrier: TargetTypeRef; readonly negative: boolean; readonly storage:
      | { readonly kind: "int64" | "uint64"; readonly value: bigint }
      | { readonly kind: "bytes"; readonly bytes: readonly number[] } };

export interface CsharpLiteralEmissionRecords {
  readonly literalEmission: { readonly get: (node: Node) => CsharpLiteralEmission | undefined };
}
