import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
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
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
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
const numberTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(numberTargetMemberMetadata);
const numberPropertyTargetMembers = new Map<string, TargetMember>([
  "MAX_VALUE",
  "MIN_VALUE",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "POSITIVE_INFINITY",
  "NEGATIVE_INFINITY",
  "NaN",
  "EPSILON",
].map((sourceName) => {
  const member = numberPropertyMetadata(sourceName);
  return [sourceName, {
    id: member.id,
    sourceName: member.sourceName,
    targetName: member.targetName,
    kind: member.kind,
    parameters: member.parameters ?? [],
    returnType: member.returnType,
    declaringType: member.declaringType,
    static: member.static,
  }] as const;
}));

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

export function numberTargetMembersForSourceName(sourceName: string): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(numberTargetMemberIndex, sourceName);
}

export function numberPropertyTargetMemberForSourceName(sourceName: string): TargetMember | undefined {
  return numberPropertyTargetMembers.get(sourceName);
}

export function numberStaticCallRequiresNoReceiver(sourceName: string): boolean {
  return numberStaticMethodNames.has(sourceName);
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

const numberStaticMethodNames = new Set([
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "isInteger",
  "isSafeInteger",
]);
