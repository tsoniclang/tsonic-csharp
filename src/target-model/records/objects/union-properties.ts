import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../program/source-profile-invocations.js";
import type { SourceMemberAccessSelection } from "@tsonic/target-api/source";

export interface CsharpUnionProperty {
  readonly kind: "union-property";
  readonly source: SourceMemberAccessSelection;
  readonly unionCarrier: TargetTypeRef;
  readonly selectedVariantIndexes: readonly number[];
  readonly variants: readonly { readonly carrier: TargetTypeRef;
    readonly operation?: Extract<CsharpSourceProfilePropertyPolicyResult, { readonly kind: "resolved" }> }[];
  readonly resultCarrier: TargetTypeRef;
}
