import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "./source-library.js";

const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const booleanOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.BooleanOps", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "BooleanOps"));

export function isCsharpBooleanTargetType(type: unknown): boolean {
  return (type as { readonly kind?: unknown; readonly name?: unknown } | undefined)?.kind === "source-primitive" &&
    (type as { readonly name?: unknown }).name === "bool";
}

export function getBooleanTargetMembers(sourceName: string): readonly TargetMember[] {
  switch (sourceName) {
    case "toString":
      return [booleanHelperMethod("toString", stringType)];
    case "valueOf":
      return [booleanHelperMethod("valueOf", boolType)];
    default:
      return [];
  }
}

function booleanHelperMethod(sourceName: string, returnType: TargetTypeRef): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.BooleanOps.${sourceName}`, sourceName, sourceName, [
    targetParameter("value", boolType),
  ], returnType, {
    declaringType: booleanOpsType,
    static: true,
    receiverPassing: "first-argument",
  });
}
