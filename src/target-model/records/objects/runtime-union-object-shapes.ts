import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../types/model.js";

export type CsharpRuntimeUnionObjectShapePropertyResolution =
  | { readonly kind: "not-runtime-union" }
  | {
      readonly kind: "resolved";
      readonly members: readonly CsharpRuntimeUnionObjectShapeMember[];
      readonly resultType: TargetTypeRef;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpRuntimeUnionObjectShapeMember {
  readonly armIndex: number;
  readonly armType: TargetTypeRef;
  readonly shape: CsharpObjectShapeFact;
  readonly member: CsharpObjectShapeMemberFact;
}
