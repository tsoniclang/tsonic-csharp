import type { CsharpProviderArgumentAdapter } from "../../../providers/relations/index.js";
import type { TargetTypeRef } from "../../types/index.js";

export type CsharpConversionMode = "implicit" | "explicit";

export interface CsharpArrayLikeUnionProjection {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: Extract<CsharpConversionSelection, { readonly kind: "array-like-union" }>;
}

export type CsharpConversionSelection =
  | { readonly kind: "never" }
  | { readonly kind: "checked-native-integer" }
  | { readonly kind: "exact-integer"; readonly input: TargetTypeRef; readonly output: TargetTypeRef; readonly nullable: boolean }
  | { readonly kind: "integer-truncation"; readonly signed: boolean; readonly width: number }
  | { readonly kind: "identity" }
  | { readonly kind: "array-like-union"; readonly arms: readonly TargetTypeRef[] }
  | { readonly kind: "runtime-union-reference"; readonly arms: readonly TargetTypeRef[]; readonly target: TargetTypeRef }
  | { readonly kind: "empty-record"; readonly source: TargetTypeRef; readonly target: TargetTypeRef }
  | {
      readonly kind: "implicit";
      readonly proof:
        | "numeric"
        | "literal"
        | "nullable"
        | "reference"
        | "tuple"
        | "object-shape-interface"
        | "collection-interface"
        | "provider-operator";
      readonly providerOperatorId?: string;
    }
  | {
      readonly kind: "implicit";
      readonly proof: "runtime-union-arm";
      readonly armIndex: number;
      readonly armType: TargetTypeRef;
      readonly sourceToArm: CsharpConversionSelection;
    }
  | {
      readonly kind: "cast";
      readonly proof:
        | "numeric"
        | "nullable"
        | "reference"
        | "tuple"
        | "provider-operator";
      readonly providerOperatorId?: string;
    }
  | { readonly kind: "nullable-reference" }
  | { readonly kind: "nullable-value"; readonly asserted: boolean }
  | {
      readonly kind: "runtime-union-projection";
      readonly armIndex: number;
      readonly armType: TargetTypeRef;
      readonly unwrapNullableValue: boolean;
    }
  | {
      readonly kind: "delegate-adapter";
      readonly parameterConversions: readonly CsharpConversionSelection[];
      readonly returnConversion: CsharpConversionSelection;
    }
  | {
      readonly kind: "provider-argument-adapter";
      readonly adapter: CsharpProviderArgumentAdapter;
      readonly sourceToInput: CsharpConversionSelection;
      readonly resultToTarget: CsharpConversionSelection;
    }
  | {
      readonly kind: "lifted-provider-argument-adapter";
      readonly adapter: CsharpProviderArgumentAdapter;
      readonly sourceElementType: TargetTypeRef;
      readonly targetElementType: TargetTypeRef;
    }
  | { readonly kind: "js-value-box" }
  | {
      readonly kind: "js-value-cast";
      readonly runtimeUnionArms?: readonly TargetTypeRef[];
    }
  | {
      readonly kind: "ambiguous";
      readonly candidateIds: readonly string[];
      readonly reason: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export type CsharpConversionTargetPreference =
  | "left"
  | "right"
  | "equivalent"
  | "incomparable";

export type CsharpCommonImplicitTargetSelection =
  | { readonly kind: "resolved"; readonly target: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string };
