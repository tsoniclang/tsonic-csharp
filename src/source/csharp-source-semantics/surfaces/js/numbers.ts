import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceSingleTargetMemberForSourceMember,
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMembersForSourceMember,
} from "./target-member-metadata.js";

const numberOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.Number", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Number"));
const stringType = csharpStringTargetType();
const numberType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const numberValueParameter = targetParameter("value", numberType);
const numberTargetMemberMetadata = [
  staticNumberMethodMetadata("parseInt", [targetParameter("str", stringType)], numberType),
  staticNumberMethodMetadata("parseInt", [targetParameter("str", stringType), targetParameter("radix", intType)], numberType, "radix"),
  staticNumberMethodMetadata("parseFloat", [targetParameter("str", stringType)], numberType),
  ...["isNaN", "isFinite", "isInteger", "isSafeInteger"].map((sourceName) =>
    staticNumberMethodMetadata(sourceName, [numberValueParameter], boolType)
  ),
  instanceNumberMethodMetadata("toString", stringType),
  instanceNumberMethodMetadata("valueOf", numberType),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const numberTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Number", numberTargetMemberMetadata);
const numberPropertyTargetMemberMetadata = [
  "MAX_VALUE",
  "MIN_VALUE",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "POSITIVE_INFINITY",
  "NEGATIVE_INFINITY",
  "NaN",
  "EPSILON",
].map((sourceName) => numberPropertyMetadata(sourceName)) satisfies readonly JsSurfaceTargetMemberMetadata[];
const numberPropertyTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Number", numberPropertyTargetMemberMetadata);

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

export function numberTargetMembersForSourceMember(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceMember(numberTargetMemberIdentityIndex, sourceMember);
}

export function numberPropertyTargetMemberForSourceMember(sourceMember: SourceLibraryMember): TargetMember | undefined {
  return jsSurfaceSingleTargetMemberForSourceMember(numberPropertyTargetMemberIdentityIndex, sourceMember);
}

function staticNumberMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  idSuffix?: string,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Number.${sourceName}${idSuffix === undefined ? "" : `:${idSuffix}`}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: numberOpsType,
    static: true,
  };
}

function instanceNumberMethodMetadata(sourceName: string, returnType: TargetTypeRef): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Number.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters: [numberValueParameter],
    returnType,
    declaringType: numberOpsType,
    static: true,
    receiverPassing: "first-argument",
  };
}

function numberPropertyMetadata(sourceName: string): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Number.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "property",
    returnType: numberType,
    declaringType: numberOpsType,
    static: true,
  };
}
