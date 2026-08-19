import type { CsharpProviderArgumentAdapter } from "../../../providers/relations/index.js";
import type { TargetTypeRef } from "../../types/index.js";

export type CsharpConversionMode = "implicit" | "explicit";

export type CsharpConversionSelection =
  | { readonly kind: "identity" }
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
  | { readonly kind: "nullable-value" }
  | {
      readonly kind: "runtime-union-projection";
      readonly armIndex: number;
      readonly armType: TargetTypeRef;
    }
  | { readonly kind: "delegate-adapter" }
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
