import type { SourceFileSemantics } from "@tsonic/target-api/source";

import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/index.js";

import type { CsharpSourceProfileElementPolicyResult } from "../../model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/source-profile-invocations.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

import type { TargetTypeRef } from "../../../target-model/types/model.js";
const instanceReceiver = { kind: "instance" } as const;
export function selectCsharpFixedArrayPropertyPlan(carrier: Extract<TargetTypeRef, { readonly kind: "array" }>): CsharpSourceProfilePropertyPolicyResult {
  return {
    kind: "resolved",
    targetMember: Object.freeze({
      id: "tsonic.csharp.source-core.FixedArray.length",
      sourceName: "length",
      targetName: "Length",
      kind: "property",
      declaringType: carrier,
      parameters: [],
      returnType: csharpSourcePrimitiveTargetType("int32"),
      readonly: true,
    }),
    receiver: instanceReceiver,
    invocation: { kind: "member" },
  };
}
export function selectCsharpFixedArrayElementPlan(
  carrier: Extract<TargetTypeRef, { readonly kind: "array" }>, indexType: TargetTypeRef,
): CsharpSourceProfileElementPolicyResult {
  return {
    kind: "resolved",
    targetMember: Object.freeze({
      id: "tsonic.csharp.source-core.FixedArray.index",
      sourceName: "Item",
      targetName: "Item",
      kind: "indexer",
      declaringType: carrier,
      parameters: [Object.freeze({
        name: "index",
        type: indexType,
        passingMode: "by-value",
      })],
      returnType: carrier.element,
    }),
    targetParameterIndex: 0,
    receiver: instanceReceiver,
    invocation: { kind: "indexer" },
  };
}
