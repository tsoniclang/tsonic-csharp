import type { CsharpArrayLikeUnionProjection } from "../../../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../../../target-model/types/native-type-data.js";
import type { CsharpSourceProfileElementPolicyResult } from "../../../model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../../target-model/records/program/source-profile-invocations.js";

import { csharpNullableTargetType, csharpNullableValueTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpArrayLikeElement, csharpArrayLikeTargetType } from "../../../../target-model/types/carriers/array-like.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { isCsharpIntegralTargetType } from "../../../../target-model/types/index.js";
import { sourcePrimitiveImplicitlyConverts } from "../../../conversions/source-primitives.js";
import { csharpSourceProfileDiagnostic } from "../source-profile-policy.js";
import { selectCsharpConversion } from "../../../conversions/core.js";
import { csharpConversionIsApplicable } from "../../../conversions/applicability.js";
import type { CsharpRepresentedType } from "../../../../target-model/types/representation.js";
import type { CsharpArrayUnionRead } from "../../../../target-model/records/objects/members.js";

import { jsRuntimeTargetType, staticMethod, targetParameter, targetProperty } from "./common.js";

export function selectCsharpArrayUnionPropertyPlan(projection: CsharpArrayLikeUnionProjection): CsharpSourceProfilePropertyPolicyResult {
  return {
    kind: "resolved", receiver: { kind: "instance" }, invocation: { kind: "array-like", projection },
    targetMember: targetProperty("Tsonic.CSharp.Js.IArrayLike.Length", "length", "Length", projection.target, csharpSourcePrimitiveTargetType("int32"), { readonly: true }),
  };
}
export function selectCsharpArrayUnionElementPlan(
  input: Parameters<typeof selectCsharpConversion>[0],
  source: Extract<CsharpRepresentedType, { readonly kind: "closed-source-sum" }>,
  indexType: TargetTypeRef,
  selectedResult: TargetTypeRef,
): CsharpSourceProfileElementPolicyResult {
  const presentResult = getCsharpNullableElementTargetType(selectedResult) ?? selectedResult;
  if (source.slots.length === 0 || source.armStorage.some(arm => arm.kind === "absence") ||
    presentResult.kind !== "source-primitive") return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", 9101002,
      "A native array union read requires its complete nonnullable physical slots and published primitive result."),
  };
  const nativeIndex = isCsharpIntegralTargetType(indexType);
  if (!nativeIndex && !targetTypeRefEquals(indexType, numberType) &&
    !sourcePrimitiveImplicitlyConverts(numberType, indexType)) return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", 9101002,
      "A common array read requires a native integer index or a JS numeric-property key with an exact native conversion to float64."),
  };
  const method = nativeIndex ? "ReadValue" : "ReadNumericProperty";
  const keyType = nativeIndex ? intType : numberType;
  const result = csharpNullableTargetType(selectedResult);
  const variants: CsharpArrayUnionRead["variants"][number][] = [];
  for (const [slotIndex, slot] of source.slots.entries()) {
    const carrier = slot.carrier;
    const element = csharpArrayLikeElement(carrier, input.typeDefinitions);
    if (element?.kind !== "source-primitive") return {
      kind: "rejected",
      diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", 9101002,
        "A native array union read requires an exact primitive element on every physical slot."),
    };
    const receiver = csharpArrayLikeTargetType(element);
    const returnType = csharpNullableValueTargetType(element);
    const receiverConversion = selectCsharpConversion(input, carrier, receiver, "implicit");
    const resultConversion = selectCsharpConversion(input, returnType, result, "implicit");
    if (!csharpConversionIsApplicable(receiverConversion, "implicit") ||
      !csharpConversionIsApplicable(resultConversion, "implicit")) return {
      kind: "rejected",
      diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", 9101002,
        "Every native array slot requires its exact receiver and published-result conversion."),
    };
    variants.push(Object.freeze({ slotIndex, carrier, receiverConversion, resultConversion,
      targetMember: staticMethod(`Tsonic.CSharp.Js.ArrayLike.${method}`, "index", method, jsRuntimeTargetType("ArrayLike"),
        [targetParameter("receiver", receiver), targetParameter("index", keyType)], returnType) }));
  }
  return Object.freeze({ kind: "array-union-read", plan: Object.freeze({ source: source.carrier,
    storage: source.slots.length === 1 ? "direct" : "union", result, indexType: keyType,
    variants: Object.freeze(variants) }) });
}
const intType = csharpSourcePrimitiveTargetType("int32");
const numberType = csharpSourcePrimitiveTargetType("float64");
