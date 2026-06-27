import type {
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
  isCsharpValueTypeTargetType,
  targetParameter,
} from "../../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";
import {
  arrayHelperMethod,
} from "./builders.js";
import {
  arrayCallbackHelpers,
} from "./callback-members.js";

export function arrayNullishElementHelpers(
  sourceName: string,
  idBase: string,
  valueTargetName: string,
  referenceTargetName: string,
  parameters: readonly TargetParameter[],
  itemType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly JsSurfaceTargetMemberMetadata[] {
  const selection = getNullishElementHelperSelection(itemType, valueTargetName, referenceTargetName);
  return selection === undefined
    ? []
    : [arrayHelperMethod(sourceName, selection.targetName, parameters, csharpNullableTargetType(itemType), declaringType, { idSuffix: `${idBase}:${selection.kind}` })];
}

export function arrayNullishElementCallbackHelpers(
  sourceName: string,
  idBase: string,
  valueTargetName: string,
  referenceTargetName: string,
  delegateKind: "System.Func",
  itemType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  arrayType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly JsSurfaceTargetMemberMetadata[] {
  const selection = getNullishElementHelperSelection(itemType, valueTargetName, referenceTargetName);
  return selection === undefined
    ? []
    : arrayCallbackHelpers(sourceName, selection.targetName, delegateKind, itemType, callbackReturnType, csharpNullableTargetType(itemType), arrayType, declaringType, { idBase: `${idBase}:${selection.kind}` });
}

export function arrayAtHelpers(
  sourceName: string,
  idBase: string,
  arrayType: TargetTypeRef,
  itemType: TargetTypeRef,
  intType: TargetTypeRef,
  declaringType: TargetTypeRef,
): readonly JsSurfaceTargetMemberMetadata[] {
  if (isCsharpValueTypeTargetType(itemType)) {
    return [arrayHelperMethod(sourceName, "atValue", [targetParameter("array", arrayType), targetParameter("index", intType)], csharpNullableTargetType(itemType), declaringType, { idSuffix: `${idBase}:value` })];
  }
  if (itemType.kind === "type-parameter") {
    return [];
  }
  return [arrayHelperMethod(sourceName, "atReference", [targetParameter("array", arrayType), targetParameter("index", intType)], csharpNullableTargetType(itemType), declaringType, { idSuffix: `${idBase}:reference` })];
}

function getNullishElementHelperSelection(
  itemType: TargetTypeRef,
  valueTargetName: string,
  referenceTargetName: string,
): { readonly kind: "value"; readonly targetName: string } | { readonly kind: "reference"; readonly targetName: string } | undefined {
  if (isCsharpValueTypeTargetType(itemType)) {
    return { kind: "value", targetName: valueTargetName };
  }
  return itemType.kind === "type-parameter" ? undefined : { kind: "reference", targetName: referenceTargetName };
}
