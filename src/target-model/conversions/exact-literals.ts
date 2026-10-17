import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpNumericLiteralToken } from "../syntax/numeric-literals.js";
import type { SourcePropertyNameSelection } from "@tsonic/target-api/source";

export type CsharpExactLiteralPrimitive = Extract<TargetTypeRef, { readonly kind: "source-primitive" }>;
export type CsharpExactLiteralRole = "value" | "property-key";

export type CsharpExactLiteralRecipe =
  | { readonly kind: "signed-zero"; readonly target: CsharpExactLiteralPrimitive; readonly precision: "float64" }
  | { readonly kind: "char"; readonly value: string }
  | { readonly kind: "string"; readonly value: string }
  | {
      readonly kind: "float";
      readonly target: CsharpExactLiteralPrimitive;
      readonly precision: "float16";
      readonly bits: number;
    }
  | {
      readonly kind: "float";
      readonly target: CsharpExactLiteralPrimitive;
      readonly precision: "float32" | "float64" | "decimal";
      readonly token: CsharpNumericLiteralToken;
      readonly negative: boolean;
    }
  | {
      readonly kind: "integer";
      readonly target: CsharpExactLiteralPrimitive;
      readonly width: "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" |
        "int64" | "uint64" | "int128" | "uint128" | "native-int" | "native-uint";
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
  readonly propertyKey?: SourcePropertyNameSelection;
}

export interface CsharpNativePropertyKeyBinding {
  readonly property: Node;
  readonly name: Node;
  readonly target: TargetTypeRef;
}

export interface CsharpNativePropertyKey extends CsharpNativePropertyKeyBinding {
  readonly literal: CsharpExactLiteralRecipe;
}

export interface CsharpExactLiteralSelectionIndex {
  readonly exactLiteral: {
    readonly get: (expression: Node, target: TargetTypeRef | undefined, role?: CsharpExactLiteralRole) => CsharpExactLiteralSelection | undefined;
  };
}
