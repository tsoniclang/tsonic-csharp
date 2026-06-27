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
  jsSurfaceTargetMembersForSelectedSourceIdentity,
  jsSurfaceTargetMemberMetadataIdentityIndex,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";

const numberOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.Number", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Number"));
const stringType = csharpStringTargetType();
const numberType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const numberValueParameter = targetParameter("value", numberType);

interface NumberMethodMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ReturnType<typeof targetParameter>[];
  readonly returnType: TargetTypeRef;
  readonly receiverPassing?: "first-argument";
}

interface NumberPropertyMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
}

const numberTargetMemberMetadata = [
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.parseInt", sourceName: "parseInt", targetName: "parseInt", parameters: [targetParameter("str", stringType)], returnType: numberType }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.parseInt:radix", sourceName: "parseInt", targetName: "parseInt", parameters: [targetParameter("str", stringType), targetParameter("radix", intType)], returnType: numberType }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.parseFloat", sourceName: "parseFloat", targetName: "parseFloat", parameters: [targetParameter("str", stringType)], returnType: numberType }),
  ...[
    { id: "Tsonic.CSharp.Js.Number.isNaN", sourceName: "isNaN", targetName: "isNaN" },
    { id: "Tsonic.CSharp.Js.Number.isFinite", sourceName: "isFinite", targetName: "isFinite" },
    { id: "Tsonic.CSharp.Js.Number.isInteger", sourceName: "isInteger", targetName: "isInteger" },
    { id: "Tsonic.CSharp.Js.Number.isSafeInteger", sourceName: "isSafeInteger", targetName: "isSafeInteger" },
  ].map((row) => numberMethodMetadata({ ...row, parameters: [numberValueParameter], returnType: boolType })),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.toString", sourceName: "toString", targetName: "toString", parameters: [numberValueParameter], returnType: stringType, receiverPassing: "first-argument" }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.valueOf", sourceName: "valueOf", targetName: "valueOf", parameters: [numberValueParameter], returnType: numberType, receiverPassing: "first-argument" }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const numberTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Number", numberTargetMemberMetadata);
const numberPropertyTargetMemberMetadata = [
  { id: "Tsonic.CSharp.Js.Number.MAX_VALUE", sourceName: "MAX_VALUE", targetName: "MAX_VALUE" },
  { id: "Tsonic.CSharp.Js.Number.MIN_VALUE", sourceName: "MIN_VALUE", targetName: "MIN_VALUE" },
  { id: "Tsonic.CSharp.Js.Number.MAX_SAFE_INTEGER", sourceName: "MAX_SAFE_INTEGER", targetName: "MAX_SAFE_INTEGER" },
  { id: "Tsonic.CSharp.Js.Number.MIN_SAFE_INTEGER", sourceName: "MIN_SAFE_INTEGER", targetName: "MIN_SAFE_INTEGER" },
  { id: "Tsonic.CSharp.Js.Number.POSITIVE_INFINITY", sourceName: "POSITIVE_INFINITY", targetName: "POSITIVE_INFINITY" },
  { id: "Tsonic.CSharp.Js.Number.NEGATIVE_INFINITY", sourceName: "NEGATIVE_INFINITY", targetName: "NEGATIVE_INFINITY" },
  { id: "Tsonic.CSharp.Js.Number.NaN", sourceName: "NaN", targetName: "NaN" },
  { id: "Tsonic.CSharp.Js.Number.EPSILON", sourceName: "EPSILON", targetName: "EPSILON" },
].map(numberPropertyMetadata) satisfies readonly JsSurfaceTargetMemberMetadata[];
export const numberPropertyTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Number", numberPropertyTargetMemberMetadata);

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

export function numberTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSelectedSourceIdentity(numberTargetMemberIdentityIndex, selectedIdentity);
}

function numberMethodMetadata(row: NumberMethodMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: numberOpsType,
    static: true,
    ...(row.receiverPassing === undefined ? {} : { receiverPassing: row.receiverPassing }),
  };
}

function numberPropertyMetadata(row: NumberPropertyMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "property",
    returnType: numberType,
    declaringType: numberOpsType,
    static: true,
  };
}
