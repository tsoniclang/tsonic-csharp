import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../types/model.js";

export type CsharpJsValueObjectShapePropertyResolution =
  | { readonly kind: "not-js-value-object-shape" }
  | {
      readonly kind: "resolved";
      readonly shape: CsharpObjectShapeFact;
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };
