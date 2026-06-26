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

const numberOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.Number", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Number"));
const stringType = csharpStringTargetType();
const numberType = csharpSourcePrimitiveTargetType("float64");

export function isCsharpNumberTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" &&
    (
      type.name === "float64" ||
      type.name === "float32" ||
      type.name === "int32" ||
      type.name === "uint32" ||
      type.name === "int16" ||
      type.name === "uint16" ||
      type.name === "int8" ||
      type.name === "uint8"
    );
}

export function getNumberTargetMembers(sourceName: string): readonly TargetMember[] {
  switch (sourceName) {
    case "toString":
      return [numberHelperMethod("toString", stringType)];
    default:
      return [];
  }
}

function numberHelperMethod(sourceName: string, returnType: TargetTypeRef): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Number.${sourceName}`, sourceName, sourceName, [
    targetParameter("value", numberType),
  ], returnType, {
    declaringType: numberOpsType,
    static: true,
    receiverPassing: "first-argument",
  });
}
