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
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMemberMetadataWithSourceIdentity,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";

const numberOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.Number", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Number"));
const globalsType = csharpTargetNamedType("Tsonic.CSharp.Js.Globals", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Globals"));
const objectType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringType = csharpStringTargetType();
const numberType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const boolType = csharpSourcePrimitiveTargetType("bool");
const numberValueParameter = targetParameter("value", numberType);
const numberOptionalDigitsParameter = targetParameter("digits", intType, { optional: true });
const numberOptionalPrecisionParameter = targetParameter("precision", intType, { optional: true });
const numberOptionalLocaleParameter = targetParameter("locales", objectType, {
  optional: true,
  csharpAcceptsClosedSourceArgument: true,
});
const numberOptionalFormatOptionsParameter = targetParameter("options", objectType, {
  optional: true,
  csharpAcceptsClosedSourceArgument: true,
});
const numberConversionParameter = targetParameter("value", objectType, {
  optional: true,
  csharpAcceptsClosedSourceArgument: true,
});
const numberCapabilityId = "surface.js.number-methods";
const numberRequiredFacts = [
  "selected source declaration/signature identity",
  "closed numeric argument or receiver target facts",
  "Tsonic.CSharp.Js.Number runtime metadata row",
] as const;

interface NumberMethodMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ReturnType<typeof targetParameter>[];
  readonly returnType: TargetTypeRef;
  readonly declaringType?: TargetTypeRef;
  readonly requiredFacts?: readonly string[];
  readonly semanticEquivalence?: string;
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
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.toExponential", sourceName: "toExponential", targetName: "toExponential", parameters: [numberValueParameter, numberOptionalDigitsParameter], returnType: stringType, receiverPassing: "first-argument" }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.toFixed", sourceName: "toFixed", targetName: "toFixed", parameters: [numberValueParameter, numberOptionalDigitsParameter], returnType: stringType, receiverPassing: "first-argument" }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.toPrecision", sourceName: "toPrecision", targetName: "toPrecision", parameters: [numberValueParameter, numberOptionalPrecisionParameter], returnType: stringType, receiverPassing: "first-argument" }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.toLocaleString", sourceName: "toLocaleString", targetName: "toLocaleString", parameters: [numberValueParameter, numberOptionalLocaleParameter, numberOptionalFormatOptionsParameter], returnType: stringType, receiverPassing: "first-argument" }),
  numberMethodMetadata({ id: "Tsonic.CSharp.Js.Number.valueOf", sourceName: "valueOf", targetName: "valueOf", parameters: [numberValueParameter], returnType: numberType, receiverPassing: "first-argument" }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const numberTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("Number", numberTargetMemberMetadata),
);
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
export const numberPropertyTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("Number", numberPropertyTargetMemberMetadata),
);

const numberConstructorCallTargetMemberMetadata = [
  numberMethodMetadata({
    id: "Tsonic.CSharp.Js.Globals.Number(System.Object)",
    sourceName: "constructor",
    targetName: "Number",
    parameters: [numberConversionParameter],
    returnType: numberType,
    declaringType: globalsType,
    requiredFacts: [
      "selected NumberConstructor call signature identity",
      "call-vs-construct expression shape",
      "closed target facts for provided conversion argument",
      "Tsonic.CSharp.Js.Globals.Number runtime metadata row",
    ],
    semanticEquivalence: "Selected Number(value) source call preserves ECMAScript Number conversion semantics through Tsonic.CSharp.Js.Globals.Number; new Number(value) is intentionally not selected without a closed wrapper-object carrier.",
  }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

const numberConstructorCallTargetMembers = numberConstructorCallTargetMemberMetadata.map(jsSurfaceTargetMemberFromMetadata);

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

export function numberConstructorTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  mode: "call" | "new",
): readonly TargetMember[] {
  return mode === "call" && selectedIdentity.key === "Number.constructor"
    ? numberConstructorCallTargetMembers
    : [];
}

function numberMethodMetadata(row: NumberMethodMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: row.declaringType ?? numberOpsType,
    static: true,
    ...(row.receiverPassing === undefined ? {} : { receiverPassing: row.receiverPassing }),
    capabilityId: numberCapabilityId,
    requiredFacts: row.requiredFacts ?? numberRequiredFacts,
    semanticEquivalence: row.semanticEquivalence ?? "Selected Tsonic.CSharp.Js.Number runtime member preserves ECMAScript Number operation semantics for closed primitive numeric carriers.",
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
    capabilityId: numberCapabilityId,
    requiredFacts: ["selected source property identity", "Tsonic.CSharp.Js.Number runtime metadata row"],
    semanticEquivalence: "Selected Tsonic.CSharp.Js.Number runtime constant preserves the corresponding ECMAScript Number constant value.",
  };
}
