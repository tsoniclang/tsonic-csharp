import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-carriers.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "./source-library.js";
import {
  csharpJsObjectCarrierTargetType,
} from "./objects.js";

const jsonRuntimeType = csharpTargetNamedType("Tsonic.CSharp.Js.JSON", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSON"));
const nullableObjectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "nullable" });
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const numberTargetType = csharpSourcePrimitiveTargetType("float64");
const jsonArrayElementType: TargetTypeRef = {
  kind: "type-parameter",
  name: "T",
};

export function getJsonTargetMembers(sourceName: string): readonly TargetMember[] {
  switch (sourceName) {
    case "parse":
      return [
        jsonStaticMethod("parse", "parse", [
          targetParameter("text", stringTargetType),
        ], nullableObjectTargetType),
      ];
    case "stringify":
      return [
        jsonStaticMethod("stringify:string", "stringify", [
          targetParameter("value", stringTargetType),
        ], stringTargetType),
        jsonStaticMethod("stringify:number", "stringify", [
          targetParameter("value", numberTargetType),
        ], stringTargetType),
        jsonStaticMethod("stringify:bool", "stringify", [
          targetParameter("value", boolTargetType),
        ], stringTargetType),
        jsonStaticMethod("stringify:object", "stringify", [
          targetParameter("value", csharpJsObjectCarrierTargetType()),
        ], stringTargetType),
        jsonStaticMethod("stringify:array", "stringify", [
          targetParameter("value", csharpJsArrayCarrierTargetType(jsonArrayElementType)),
        ], stringTargetType),
        jsonStaticMethod("stringify:nullish", "stringify", [
          targetParameter("value", nullableObjectTargetType),
        ], stringTargetType),
      ];
    default:
      return [];
  }
}

function jsonStaticMethod(
  idSuffix: string,
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.JSON.${idSuffix}`, sourceName, sourceName, parameters, returnType, {
    declaringType: jsonRuntimeType,
    static: true,
  });
}
