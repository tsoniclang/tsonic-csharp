import type { CsharpConversionSelection } from "../../conversions/selection.js";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export type CsharpCallableParameterAdapter =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "omitted"; readonly parameterIndex: number }
  | { readonly kind: "rest-element"; readonly parameterIndex: number; readonly offset: number;
      readonly optional: boolean; readonly lengthMember: string; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "rest"; readonly target: TargetTypeRef; readonly element: TargetTypeRef;
      readonly collection: "array" | "js-array"; readonly segments: readonly CsharpCallableRestSegment[] };

export interface CsharpCallableValueAdapter {
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export type CsharpCallableRestSegment =
  | { readonly kind: "value"; readonly parameterIndex: number; readonly adapter: CsharpCallableValueAdapter }
  | { readonly kind: "sequence"; readonly parameterIndex: number; readonly offset: number;
      readonly lengthMember: string; readonly adapter: CsharpCallableValueAdapter };
