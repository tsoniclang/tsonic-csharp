import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { isCsharpJsValueTargetType } from "./carriers/runtime-carriers.js";

export type CsharpJsValueObjectShapeMemberResolution =
  | { readonly kind: "not-js-value-object-shape" }
  | {
      readonly kind: "resolved";
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpJsValueObjectLiteralShapeProjection =
  | {
      readonly kind: "resolved";
      readonly shape: CsharpObjectShapeFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function isCsharpJsValueObjectShapeTargetType(
  type: TargetTypeRef | undefined,
): type is CsharpTargetNamedTypeRef {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpJsObjectShape === true &&
    isCsharpJsValueTargetType(type);
}
