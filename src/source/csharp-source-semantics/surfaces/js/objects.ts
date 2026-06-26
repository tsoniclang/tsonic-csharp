import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-target-type.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMembersForSourceMember,
} from "./target-member-metadata.js";
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";

const objectRuntimeTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Object", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Object"));
const jsObjectCarrierType = csharpTargetNamedType("Tsonic.CSharp.Js.JSObject", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSObject"));
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const objectMemberTypeParameter = { kind: "type-parameter" as const, name: "T" };

export function objectTargetMembersForSourceMember(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceMember(objectTargetMemberIdentityIndex, sourceMember);
}

export function hasObjectTargetMember(sourceName: string): boolean {
  return objectTargetMemberMetadata.some((member) => member.sourceName === sourceName);
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
): JsSurfaceTargetMemberMetadata {
  return {
    id,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: objectRuntimeTargetType,
    static: true,
  };
}

function objectHelperMethod(
  sourceName: "keys" | "values" | "entries",
  carrierName: string,
  valueType: TargetTypeRef,
  returnElementType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return objectRuntimeMethod(
    `Tsonic.CSharp.Js.Object.${sourceName}:${carrierName}`,
    sourceName,
    [targetParameter("value", valueType)],
    csharpListTargetType(returnElementType),
  );
}

export function objectRecordDictionaryTargetMembersForOperation(
  operation: "keys" | "values" | "entries",
  dictionaryType: CsharpRecordDictionaryTargetTypeRef,
): readonly TargetMember[] {
  const valueType = dictionaryType.typeArguments?.[1];
  if (valueType === undefined) {
    return [];
  }
  return [
      objectHelperMethod("keys", "dictionary", dictionaryType, csharpStringTargetType()),
      objectHelperMethod("values", "dictionary", dictionaryType, valueType),
      objectHelperMethod("entries", "dictionary", dictionaryType, { kind: "tuple", elements: [csharpStringTargetType(), valueType] }),
    ]
    .filter((member) => member.sourceName === operation)
    .map(jsSurfaceTargetMemberFromMetadata);
}

function jsObjectInstanceMethod(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.JSObject.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: jsObjectCarrierType,
  };
}

const objectTargetMemberMetadata = [
  objectHelperMethod("keys", "jsobject", jsObjectCarrierType, csharpStringTargetType()),
  objectHelperMethod("keys", "jsarray", csharpJsArrayCarrierTargetType(objectMemberTypeParameter), csharpStringTargetType()),
  objectHelperMethod("keys", "string", csharpStringTargetType(), csharpStringTargetType()),
  objectHelperMethod("values", "jsobject", jsObjectCarrierType, objectTargetType),
  objectHelperMethod("values", "jsarray", csharpJsArrayCarrierTargetType(objectMemberTypeParameter), objectMemberTypeParameter),
  objectHelperMethod("values", "string", csharpStringTargetType(), csharpStringTargetType()),
  objectHelperMethod("entries", "jsobject", jsObjectCarrierType, { kind: "tuple", elements: [csharpStringTargetType(), objectTargetType] }),
  objectHelperMethod("entries", "jsarray", csharpJsArrayCarrierTargetType(objectMemberTypeParameter), { kind: "tuple", elements: [csharpStringTargetType(), objectMemberTypeParameter] }),
  objectHelperMethod("entries", "string", csharpStringTargetType(), { kind: "tuple", elements: [csharpStringTargetType(), csharpStringTargetType()] }),
  objectRuntimeMethod("Tsonic.CSharp.Js.Object.assign", "assign", [
    targetParameter("target", jsObjectCarrierType),
    targetParameter("sources", jsObjectCarrierType, { paramsArray: true }),
  ], jsObjectCarrierType),
  objectRuntimeMethod("Tsonic.CSharp.Js.Object.hasOwn", "hasOwn", [
    targetParameter("value", jsObjectCarrierType),
    targetParameter("key", csharpStringTargetType()),
  ], csharpSourcePrimitiveTargetType("bool")),
  jsObjectInstanceMethod("hasOwnProperty", [
    targetParameter("key", csharpStringTargetType()),
  ], csharpSourcePrimitiveTargetType("bool")),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const objectTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Object", objectTargetMemberMetadata);
