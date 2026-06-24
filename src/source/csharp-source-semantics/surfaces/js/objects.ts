import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "./source-library.js";

const objectRuntimeTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Object", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Object"));
const jsObjectCarrierType = csharpTargetNamedType("Tsonic.CSharp.Js.JSObject", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSObject"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });

export function getObjectTargetMembers(sourceName: string): readonly TargetMember[] {
  const member = objectTargetMembers.get(sourceName);
  return member === undefined ? [] : [member];
}

export function csharpJsObjectCarrierTargetType(): TargetTypeRef {
  return jsObjectCarrierType;
}

function objectRuntimeMethod(
  sourceName: string,
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Object.${sourceName}`, sourceName, sourceName, [
    targetParameter("value", jsObjectCarrierType),
  ], returnType, {
    declaringType: objectRuntimeTargetType,
    static: true,
  });
}

const objectTargetMembers = new Map<string, TargetMember>([
  ["keys", objectRuntimeMethod("keys", { kind: "array", element: csharpStringTargetType() })],
  ["values", objectRuntimeMethod("values", { kind: "array", element: objectTargetType })],
  ["entries", objectRuntimeMethod("entries", { kind: "array", element: { kind: "tuple", elements: [csharpStringTargetType(), objectTargetType] } })],
]);
