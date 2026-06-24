import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "./source-library.js";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-carriers.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";

const objectRuntimeTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Object", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Object"));
const jsObjectCarrierType = csharpTargetNamedType("Tsonic.CSharp.Js.JSObject", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSObject"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const objectMemberTypeParameter = { kind: "type-parameter" as const, name: "T" };

export function getObjectTargetMembers(sourceName: string): readonly TargetMember[] {
  return objectTargetMembers.get(sourceName) ?? [];
}

export function hasObjectTargetMember(sourceName: string): boolean {
  return getObjectTargetMembers(sourceName).length > 0;
}

export function csharpJsObjectCarrierTargetType(): TargetTypeRef {
  return jsObjectCarrierType;
}

export function isCsharpJsObjectCarrierTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === jsObjectCarrierType.id;
}

function objectRuntimeMethod(
  id: string,
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(id, sourceName, sourceName, parameters, returnType, {
    declaringType: objectRuntimeTargetType,
    static: true,
  });
}

function objectHelperMethod(
  sourceName: "keys" | "values" | "entries",
  carrierName: string,
  valueType: TargetTypeRef,
  returnElementType: TargetTypeRef,
): TargetMember {
  return objectRuntimeMethod(
    `Tsonic.CSharp.Js.Object.${sourceName}:${carrierName}`,
    sourceName,
    [targetParameter("value", valueType)],
    csharpListTargetType(returnElementType),
  );
}

export function getObjectRecordDictionaryTargetMembers(
  sourceName: string,
  dictionaryType: CsharpRecordDictionaryTargetTypeRef,
): readonly TargetMember[] {
  const valueType = dictionaryType.typeArguments?.[1];
  if (valueType === undefined) {
    return [];
  }
  switch (sourceName) {
    case "keys":
      return [objectHelperMethod("keys", "dictionary", dictionaryType, csharpStringTargetType())];
    case "values":
      return [objectHelperMethod("values", "dictionary", dictionaryType, valueType)];
    case "entries":
      return [objectHelperMethod("entries", "dictionary", dictionaryType, { kind: "tuple", elements: [csharpStringTargetType(), valueType] })];
    default:
      return [];
  }
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

const objectTargetMembers = new Map<string, readonly TargetMember[]>([
  ["keys", [
    objectHelperMethod("keys", "jsobject", jsObjectCarrierType, csharpStringTargetType()),
    objectHelperMethod("keys", "jsarray", csharpJsArrayCarrierTargetType(objectMemberTypeParameter), csharpStringTargetType()),
    objectHelperMethod("keys", "string", csharpStringTargetType(), csharpStringTargetType()),
  ]],
  ["values", [
    objectHelperMethod("values", "jsobject", jsObjectCarrierType, objectTargetType),
    objectHelperMethod("values", "jsarray", csharpJsArrayCarrierTargetType(objectMemberTypeParameter), objectMemberTypeParameter),
    objectHelperMethod("values", "string", csharpStringTargetType(), csharpStringTargetType()),
  ]],
  ["entries", [
    objectHelperMethod("entries", "jsobject", jsObjectCarrierType, { kind: "tuple", elements: [csharpStringTargetType(), objectTargetType] }),
    objectHelperMethod("entries", "jsarray", csharpJsArrayCarrierTargetType(objectMemberTypeParameter), { kind: "tuple", elements: [csharpStringTargetType(), objectMemberTypeParameter] }),
    objectHelperMethod("entries", "string", csharpStringTargetType(), { kind: "tuple", elements: [csharpStringTargetType(), csharpStringTargetType()] }),
  ]],
  ["assign", [objectRuntimeMethod("Tsonic.CSharp.Js.Object.assign", "assign", [
    targetParameter("target", jsObjectCarrierType),
    targetParameter("sources", objectTargetType, { paramsArray: true }),
  ], jsObjectCarrierType)]],
  ["hasOwnProperty", [jsObjectInstanceMethod("hasOwnProperty", [
    targetParameter("key", csharpStringTargetType()),
  ], csharpSourcePrimitiveTargetType("bool"))]],
]);
