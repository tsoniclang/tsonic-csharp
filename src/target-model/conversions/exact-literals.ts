import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpNumericLiteralToken } from "../syntax/numeric-literals.js";

export type CsharpExactLiteralPrimitive = Extract<TargetTypeRef, { readonly kind: "source-primitive" }>;

export type CsharpExactLiteralRecipe =
  | { readonly kind: "signed-zero"; readonly target: CsharpExactLiteralPrimitive; readonly precision: "float64" | "float16" }
  | { readonly kind: "zero" }
  | { readonly kind: "char"; readonly value: string }
  | {
      readonly kind: "float";
      readonly target: CsharpExactLiteralPrimitive;
      readonly precision: "float16";
      readonly value: number;
    }
  | {
      readonly kind: "float";
      readonly target: CsharpExactLiteralPrimitive;
      readonly precision: "float32" | "decimal";
      readonly token: CsharpNumericLiteralToken;
      readonly negative: boolean;
    }
  | {
      readonly kind: "integer";
      readonly target: CsharpExactLiteralPrimitive;
      readonly width: "int64" | "uint64" | "int128" | "uint128" | "native-int" | "native-uint";
      readonly value: bigint;
    };

export type CsharpExactLiteralSelection =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "source-representation" }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "resolved"; readonly recipe: CsharpExactLiteralRecipe };

export interface CsharpExactLiteralRequest {
  readonly expression: Node;
  readonly target?: TargetTypeRef;
}

export interface CsharpExactLiteralSelectionIndex {
  readonly exactLiteral: {
    readonly get: (expression: Node, target: TargetTypeRef | undefined) => CsharpExactLiteralSelection | undefined;
  };
}
