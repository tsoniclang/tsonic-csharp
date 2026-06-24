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
import {
  csharpJsArrayCarrierTargetType,
} from "./array-carriers.js";

const objectRuntimeTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Object", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Object"));
const jsObjectCarrierType = csharpTargetNamedType("Tsonic.CSharp.Js.JSObject", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSObject"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });

export function getObjectTargetMembers(sourceName: string): readonly TargetMember[] {
  const member = objectTargetMembers.get(sourceName);
  return member === undefined ? [] : [member];
}

export function hasObjectTargetMember(sourceName: string): boolean {
  return objectTargetMembers.has(sourceName);
}

export function csharpJsObjectCarrierTargetType(): TargetTypeRef {
  return jsObjectCarrierType;
}

export function isCsharpJsObjectCarrierTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === jsObjectCarrierType.id;
}

function objectRuntimeMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.Object.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType: objectRuntimeTargetType,
    static: true,
  });
}

function jsObjectInstanceMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.JSObject.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType: jsObjectCarrierType,
  });
}

const objectTargetMembers = new Map<string, TargetMember>([
  ["keys", objectRuntimeMethod("keys", [
    targetParameter("value", objectTargetType),
  ], csharpJsArrayCarrierTargetType(csharpStringTargetType()))],
  ["values", objectRuntimeMethod("values", [
    targetParameter("value", objectTargetType),
  ], csharpJsArrayCarrierTargetType(objectTargetType))],
  ["entries", objectRuntimeMethod("entries", [
    targetParameter("value", objectTargetType),
  ], csharpJsArrayCarrierTargetType({ kind: "tuple", elements: [csharpStringTargetType(), objectTargetType] }))],
  ["assign", objectRuntimeMethod("assign", [
    targetParameter("target", jsObjectCarrierType),
    targetParameter("sources", objectTargetType, { paramsArray: true }),
  ], jsObjectCarrierType)],
  ["hasOwnProperty", jsObjectInstanceMethod("hasOwnProperty", [
    targetParameter("key", csharpStringTargetType()),
  ], csharpSourcePrimitiveTargetType("bool"))],
]);
