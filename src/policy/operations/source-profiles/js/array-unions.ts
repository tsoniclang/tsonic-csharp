import type { CsharpArrayLikeUnionProjection } from "../../../../target-model/conversions/selection.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../../target-model/records/source-profile-invocations.js";

import { csharpNullableValueTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/carriers/scalar-types.js";

import { jsRuntimeTargetType, staticMethod, targetParameter, targetProperty } from "./common.js";

export function selectCsharpArrayUnionPropertyPlan(projection: CsharpArrayLikeUnionProjection): CsharpSourceProfilePropertyPolicyResult {
  return {
    kind: "resolved", receiver: { kind: "instance" }, invocation: { kind: "array-like", projection },
    targetMember: targetProperty("Tsonic.CSharp.Js.IArrayLike.Length", "length", "Length", projection.target, csharpSourcePrimitiveTargetType("int32"), { readonly: true }),
  };
}
export function selectCsharpArrayUnionElementPlan(projection: CsharpArrayLikeUnionProjection): CsharpSourceProfileElementPolicyResult {
  return {
    kind: "resolved", receiver: { kind: "instance" }, targetParameterIndex: 0,
    invocation: { kind: "array-like", projection },
    targetMember: staticMethod("Tsonic.CSharp.Js.ArrayLike.ReadNumber", "index", "ReadNumber", jsRuntimeTargetType("ArrayLike"),
      [targetParameter("index", numberType)], csharpNullableValueTargetType(numberType)),
  };
}
const numberType = csharpSourcePrimitiveTargetType("float64");
