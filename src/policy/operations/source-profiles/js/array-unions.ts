import type { CsharpArrayLikeUnionProjection } from "../../../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../../target-model/records/program/source-profile-invocations.js";

import { csharpNullableValueTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { isCsharpIntegralTargetType } from "../../../../target-model/types/index.js";
import { sourcePrimitiveImplicitlyConverts } from "../../../conversions/source-primitives.js";
import { csharpSourceProfileDiagnostic } from "../source-profile-policy.js";

import { jsRuntimeTargetType, staticMethod, targetParameter, targetProperty } from "./common.js";

export function selectCsharpArrayUnionPropertyPlan(projection: CsharpArrayLikeUnionProjection): CsharpSourceProfilePropertyPolicyResult {
  return {
    kind: "resolved", receiver: { kind: "instance" }, invocation: { kind: "array-like", projection },
    targetMember: targetProperty("Tsonic.CSharp.Js.IArrayLike.Length", "length", "Length", projection.target, csharpSourcePrimitiveTargetType("int32"), { readonly: true }),
  };
}
export function selectCsharpArrayUnionElementPlan(
  projection: CsharpArrayLikeUnionProjection,
  indexType: TargetTypeRef,
): CsharpSourceProfileElementPolicyResult {
  const element = projection.target.kind === "target-named" ? projection.target.typeArguments?.[0] : undefined;
  if (element?.kind !== "source-primitive") return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", 9101002,
      "A common array view requires one exact native primitive element."),
  };
  const nativeIndex = isCsharpIntegralTargetType(indexType);
  if (!nativeIndex && !targetTypeRefEquals(indexType, numberType) &&
    !sourcePrimitiveImplicitlyConverts(numberType, indexType)) return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", 9101002,
      "A common array read requires a native integer index or a JS numeric-property key with an exact native conversion to float64."),
  };
  const method = nativeIndex ? "ReadValue" : "ReadNumericProperty";
  return {
    kind: "resolved", receiver: { kind: "instance" }, targetParameterIndex: 0,
    invocation: { kind: "array-like", projection },
    targetMember: staticMethod(`Tsonic.CSharp.Js.ArrayLike.${method}`, "index", method, jsRuntimeTargetType("ArrayLike"),
      [targetParameter("index", nativeIndex ? intType : numberType)], csharpNullableValueTargetType(element)),
  };
}
const intType = csharpSourcePrimitiveTargetType("int32");
const numberType = csharpSourcePrimitiveTargetType("float64");
