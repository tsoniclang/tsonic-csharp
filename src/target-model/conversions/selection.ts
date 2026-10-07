export type CsharpProviderArgumentAdapter =
  | {
      readonly kind: "static-method";
      readonly id: string;
      readonly declaringType: TargetTypeRef;
      readonly targetName: string;
      readonly inputType: TargetTypeRef;
      readonly resultType: TargetTypeRef;
      readonly nativeIntegerConversion?: "checked";
    };

import type { TargetTypeRef } from "../types/index.js";
import type { CsharpUnionArmMapping, CsharpUnionPathStep } from "../types/union-relations.js";
import type { CsharpIntegerRefinementConversion } from "./integer-refinement.js";

export type CsharpConversionMode = "implicit" | "explicit";

export interface CsharpArrayLikeUnionProjection {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: Extract<CsharpConversionSelection, { readonly kind: "array-like-union" }>;
}

export type CsharpConversionSelection =
  | CsharpIntegerRefinementConversion
  | { readonly kind: "union-map"; readonly coverage: "source" | "target"; readonly arms: readonly CsharpUnionArmMapping[] }
  | { readonly kind: "never" }
  | { readonly kind: "checked-native-integer" }
  | { readonly kind: "exact-integer"; readonly input: TargetTypeRef; readonly output: TargetTypeRef; readonly nullable: boolean }
  | { readonly kind: "integer-truncation"; readonly signed: boolean; readonly width: number }
  | { readonly kind: "identity" }
  | { readonly kind: "absence" }
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
      readonly kind: "nullable-map";
      readonly sourceElement: TargetTypeRef;
      readonly targetElement: TargetTypeRef;
      readonly conversion: CsharpConversionSelection;
    }
  | {
      readonly kind: "runtime-union-projection";
      readonly path: readonly CsharpUnionPathStep[];
      readonly armType: TargetTypeRef;
      readonly retainsAbsence: boolean;
      readonly refinement?: TargetTypeRef;
    }
  | {
      readonly kind: "delegate-adapter";
      readonly strategy: "native-binding" | "adaptation";
      readonly parameterConversions: readonly CsharpConversionSelection[];
      readonly returnConversion: CsharpConversionSelection | { readonly kind: "void-return" };
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

export function csharpConversionIsApplicable(
  selection: CsharpConversionSelection,
  mode: CsharpConversionMode,
): boolean {
  if (selection.kind === "nullable-map") return csharpConversionIsApplicable(selection.conversion, mode);
  return selection.kind === "identity" ||
    selection.kind === "absence" ||
    selection.kind === "union-map" && (selection.coverage === "source" || mode === "explicit") ||
    selection.kind === "never" ||
    selection.kind === "checked-native-integer" ||
    selection.kind === "exact-integer" ||
    selection.kind === "integer-refinement" ||
    selection.kind === "integer-truncation" ||
    selection.kind === "array-like-union" ||
    selection.kind === "runtime-union-reference" ||
    selection.kind === "empty-record" ||
    selection.kind === "implicit" ||
    selection.kind === "delegate-adapter" ||
    selection.kind === "provider-argument-adapter" ||
    selection.kind === "lifted-provider-argument-adapter" ||
    selection.kind === "nullable-value" ||
    selection.kind === "nullable-reference" ||
    selection.kind === "runtime-union-projection" ||
    selection.kind === "js-value-box" ||
    selection.kind === "js-value-cast" ||
    mode === "explicit" && selection.kind === "cast";
}
