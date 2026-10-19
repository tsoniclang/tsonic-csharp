import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";

export type CsharpClosedShapeConversion =
  | { readonly kind: "identity" }
  | { readonly kind: "empty-record"; readonly target: TargetTypeRef }
  | { readonly kind: "runtime-union"; readonly target: TargetTypeRef; readonly constructor: string; readonly operand: CsharpClosedShapeConversion }
  | { readonly kind: "js-value"; readonly target: TargetTypeRef };

export interface CsharpClosedShapeMemberProjection {
  readonly member: CsharpObjectShapeMemberFact;
  readonly conversion: CsharpClosedShapeConversion;
}

export type CsharpObjectProjectionEmission =
  | { readonly kind: "keys"; readonly element: TargetTypeRef; readonly keys: readonly string[] }
  | { readonly kind: "values" | "entries"; readonly element: TargetTypeRef;
      readonly members: readonly { readonly key: string; readonly name: string; readonly conversion: CsharpClosedShapeConversion }[] }
  | { readonly kind: "has-own"; readonly keys: readonly string[] }
  | { readonly kind: "assign"; readonly source: TargetTypeRef;
      readonly assignments: readonly { readonly source: string; readonly target: string; readonly conversion: CsharpClosedShapeConversion }[] };
