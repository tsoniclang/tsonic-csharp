import {
  acceptObservation,
  rejectObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpListTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetOperation,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMemberMetadataWithSourceIdentity,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";

export function mapCsharpJsStringElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!host.isCsharpStringType(receiverType)) {
    return undefined;
  }
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    if (
      existingOperation.operationKind === "indexer" &&
      context.factResolver.resolve(request.expression, csharpTargetOperationFactKey) === undefined &&
      context.facts.get(request.expression, csharpTargetOperationFactKey) === undefined
    ) {
      recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(existingOperation.operationId, "method", "Substring", {
        resultType: csharpStringTargetType(),
        argumentProjection: [
          { kind: "source-argument", index: 0 },
          { kind: "literal", value: 1 },
        ],
      }), [{ message: "C# JS surface string code-unit C# operation recorded from an existing checked target operation." }]);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# JS surface string code-unit access reused existing finalized target operation for repeated checked-element observation." }]);
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context, csharpJsCheckedTypeQuery);
  if (!host.isIntegralTargetTypeRef(indexType) && !host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_NON_INTEGRAL_STRING_INDEX", 9100112, "C# JS surface string element access requires an integral provider-backed index type."));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.js.string.codeUnit", "method", "Substring", {
    resultType: csharpStringTargetType(),
    argumentProjection: [
      { kind: "source-argument", index: 0 },
      { kind: "literal", value: 1 },
    ],
  }), [{ message: "C# JS surface string code-unit operation recorded from checked TypeScript element access." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.string.codeUnit", "indexer", "String.Substring"),
    resultType: csharpStringTargetType(),
  }, [{ message: "C# JS surface string code-unit access selected from checked TypeScript element access." }]);
}

export function stringTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSelectedSourceIdentity(stringTargetMemberIdentityIndex, selectedIdentity);
}

const stringType = csharpStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringHelperType = csharpTargetNamedType("Tsonic.CSharp.Js.String", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "String"));
const globalsType = csharpTargetNamedType("Tsonic.CSharp.Js.Globals", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Globals"));
const objectType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringReceiverParameter = targetParameter("value", stringType);
const stringConversionParameter = targetParameter("value", objectType, {
  optional: true,
  csharpAcceptsClosedSourceArgument: true,
});
const stringSearchParameter = targetParameter("search", stringType);
const stringPositionParameter = targetParameter("position", intType, { optional: true });
const stringIndexParameter = targetParameter("index", intType);
const stringCapabilityId = "surface.js.string-methods";
const stringRequiredFacts = [
  "selected source declaration/signature identity",
  "closed string receiver or static argument target facts",
  "Tsonic.CSharp.Js.String runtime metadata row",
] as const;

interface StringHelperMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly TargetParameter[];
  readonly returnType: TargetTypeRef;
  readonly declaringType?: TargetTypeRef;
  readonly requiredFacts?: readonly string[];
  readonly semanticEquivalence?: string;
  readonly receiverPassing?: "first-argument";
}

const stringTargetMemberMetadata = [
  {
    id: "System.String.ToString",
    sourceName: "toString",
    targetName: "ToString",
    kind: "method",
    returnType: stringType,
    capabilityId: stringCapabilityId,
    requiredFacts: ["selected source declaration/signature identity", "closed string receiver target facts", "System.String.ToString provider metadata row"],
    semanticEquivalence: "System.String.ToString is selected only for closed string carriers and preserves ECMAScript String.prototype.toString primitive result semantics.",
  },
  {
    id: "tsonic.csharp.js.String.concat",
    sourceName: "concat",
    targetName: "Concat",
    kind: "method",
    parameters: [
      stringReceiverParameter,
      targetParameter("values", stringType, { paramsArray: true }),
    ],
    returnType: stringType,
    declaringType: stringType,
    static: true,
    receiverPassing: "first-argument",
    capabilityId: stringCapabilityId,
    requiredFacts: stringRequiredFacts,
    semanticEquivalence: "System.String.Concat is selected through explicit metadata for closed string concat operands.",
  },
  ...[
    { id: "Tsonic.CSharp.Js.String.fromCharCode", sourceName: "fromCharCode", targetName: "fromCharCode" },
    { id: "Tsonic.CSharp.Js.String.fromCodePoint", sourceName: "fromCodePoint", targetName: "fromCodePoint" },
  ].map((row) => stringHelperMemberMetadata({ ...row, parameters: [targetParameter("code", intType, { paramsArray: true })], returnType: stringType })),
  ...[
    { id: "Tsonic.CSharp.Js.String.includes", sourceName: "includes", targetName: "includes" },
    { id: "Tsonic.CSharp.Js.String.startsWith", sourceName: "startsWith", targetName: "startsWith" },
    { id: "Tsonic.CSharp.Js.String.endsWith", sourceName: "endsWith", targetName: "endsWith" },
  ].map((row) => stringReceiverHelperMemberMetadata({ ...row, parameters: [stringReceiverParameter, stringSearchParameter, stringPositionParameter], returnType: boolType })),
  stringReceiverHelperMemberMetadata({ id: "Tsonic.CSharp.Js.String.isWellFormed", sourceName: "isWellFormed", targetName: "isWellFormed", parameters: [stringReceiverParameter], returnType: boolType }),
  ...[
    { id: "Tsonic.CSharp.Js.String.indexOf", sourceName: "indexOf", targetName: "indexOf" },
    { id: "Tsonic.CSharp.Js.String.lastIndexOf", sourceName: "lastIndexOf", targetName: "lastIndexOf" },
  ].map((row) => stringReceiverHelperMemberMetadata({ ...row, parameters: [stringReceiverParameter, stringSearchParameter, stringPositionParameter], returnType: intType })),
  ...[
    { id: "Tsonic.CSharp.Js.String.localeCompare", sourceName: "localeCompare", targetName: "localeCompare" },
    { id: "Tsonic.CSharp.Js.String.search", sourceName: "search", targetName: "search" },
  ].map((row) => stringReceiverHelperMemberMetadata({ ...row, parameters: [stringReceiverParameter, targetParameter("value", stringType)], returnType: intType })),
  stringReceiverHelperMemberMetadata({ id: "Tsonic.CSharp.Js.String.charCodeAt", sourceName: "charCodeAt", targetName: "charCodeAt", parameters: [stringReceiverParameter, stringIndexParameter], returnType: doubleType }),
  stringReceiverHelperMemberMetadata({ id: "Tsonic.CSharp.Js.String.at", sourceName: "at", targetName: "at", parameters: [stringReceiverParameter, stringIndexParameter], returnType: csharpNullableTargetType(stringType) }),
  stringReceiverHelperMemberMetadata({ id: "Tsonic.CSharp.Js.String.codePointAt", sourceName: "codePointAt", targetName: "codePointAt", parameters: [stringReceiverParameter, stringIndexParameter], returnType: csharpNullableValueTargetType(intType) }),
  stringReceiverHelperMemberMetadata({
    id: "Tsonic.CSharp.Js.String.split",
    sourceName: "split",
    targetName: "split",
    parameters: [
      stringReceiverParameter,
      targetParameter("separator", stringType),
      targetParameter("limit", intType, { optional: true }),
    ],
    returnType: csharpListTargetType(stringType),
  }),
  ...[
    { id: "Tsonic.CSharp.Js.String.replace", sourceName: "replace", targetName: "replace" },
    { id: "Tsonic.CSharp.Js.String.replaceAll", sourceName: "replaceAll", targetName: "replaceAll" },
  ].map((row) => stringReceiverHelperMemberMetadata({
    ...row,
    parameters: [
      stringReceiverParameter,
      stringSearchParameter,
      targetParameter("replacement", stringType),
    ],
    returnType: stringType,
  })),
  ...[
    { id: "Tsonic.CSharp.Js.String.substring", sourceName: "substring", targetName: "substring" },
    { id: "Tsonic.CSharp.Js.String.slice", sourceName: "slice", targetName: "slice" },
    { id: "Tsonic.CSharp.Js.String.substr", sourceName: "substr", targetName: "substr" },
  ].map((row) => stringReceiverHelperMemberMetadata({
    ...row,
    parameters: [
      stringReceiverParameter,
      targetParameter("start", intType),
      targetParameter("end", intType, { optional: true }),
    ],
    returnType: stringType,
  })),
  ...[
    { id: "Tsonic.CSharp.Js.String.padStart", sourceName: "padStart", targetName: "padStart" },
    { id: "Tsonic.CSharp.Js.String.padEnd", sourceName: "padEnd", targetName: "padEnd" },
  ].map((row) => stringReceiverHelperMemberMetadata({
    ...row,
    parameters: [
      stringReceiverParameter,
      targetParameter("targetLength", intType),
      targetParameter("padString", stringType, { optional: true }),
    ],
    returnType: stringType,
  })),
  ...[
    { id: "Tsonic.CSharp.Js.String.repeat", sourceName: "repeat", targetName: "repeat" },
    { id: "Tsonic.CSharp.Js.String.charAt", sourceName: "charAt", targetName: "charAt" },
  ].map((row) => stringReceiverHelperMemberMetadata({ ...row, parameters: [stringReceiverParameter, stringIndexParameter], returnType: stringType })),
  stringReceiverHelperMemberMetadata({ id: "Tsonic.CSharp.Js.String.normalize", sourceName: "normalize", targetName: "normalize", parameters: [stringReceiverParameter, targetParameter("form", stringType, { optional: true })], returnType: stringType }),
  ...[
    { id: "Tsonic.CSharp.Js.String.trim", sourceName: "trim", targetName: "trim" },
    { id: "Tsonic.CSharp.Js.String.trimStart", sourceName: "trimStart", targetName: "trimStart" },
    { id: "Tsonic.CSharp.Js.String.trimLeft", sourceName: "trimLeft", targetName: "trimLeft" },
    { id: "Tsonic.CSharp.Js.String.trimEnd", sourceName: "trimEnd", targetName: "trimEnd" },
    { id: "Tsonic.CSharp.Js.String.trimRight", sourceName: "trimRight", targetName: "trimRight" },
    { id: "Tsonic.CSharp.Js.String.toLowerCase", sourceName: "toLowerCase", targetName: "toLowerCase" },
    { id: "Tsonic.CSharp.Js.String.toLocaleLowerCase", sourceName: "toLocaleLowerCase", targetName: "toLocaleLowerCase" },
    { id: "Tsonic.CSharp.Js.String.toUpperCase", sourceName: "toUpperCase", targetName: "toUpperCase" },
    { id: "Tsonic.CSharp.Js.String.toLocaleUpperCase", sourceName: "toLocaleUpperCase", targetName: "toLocaleUpperCase" },
    { id: "Tsonic.CSharp.Js.String.toWellFormed", sourceName: "toWellFormed", targetName: "toWellFormed" },
    { id: "Tsonic.CSharp.Js.String.valueOf", sourceName: "valueOf", targetName: "valueOf" },
  ].map((row) => stringReceiverHelperMemberMetadata({ ...row, parameters: [stringReceiverParameter], returnType: stringType })),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const stringTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("String", stringTargetMemberMetadata),
);

const stringPropertyTargetMemberMetadata = [
  {
    id: "System.String.Length",
    sourceName: "length",
    targetName: "Length",
    kind: "property",
    returnType: intType,
    declaringType: stringType,
    capabilityId: stringCapabilityId,
    requiredFacts: ["selected source property identity", "closed string receiver target facts", "System.String.Length provider metadata row"],
    semanticEquivalence: "System.String.Length is selected only for closed string carriers and preserves ECMAScript String length code-unit semantics.",
  },
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const stringPropertyTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("String", stringPropertyTargetMemberMetadata),
);

const stringConstructorCallTargetMemberMetadata = [
  stringHelperMemberMetadata({
    id: "Tsonic.CSharp.Js.Globals.String(System.Object)",
    sourceName: "constructor",
    targetName: "String",
    parameters: [stringConversionParameter],
    returnType: stringType,
    declaringType: globalsType,
    requiredFacts: [
      "selected StringConstructor call signature identity",
      "call-vs-construct expression shape",
      "closed target facts for provided conversion argument",
      "Tsonic.CSharp.Js.Globals.String runtime metadata row",
    ],
    semanticEquivalence: "Selected String(value) source call preserves ECMAScript String conversion semantics through Tsonic.CSharp.Js.Globals.String; new String(value) is intentionally not selected without a closed wrapper-object carrier.",
  }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

const stringConstructorCallTargetMembers = stringConstructorCallTargetMemberMetadata.map(jsSurfaceTargetMemberFromMetadata);

export function stringConstructorTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  mode: "call" | "new",
): readonly TargetMember[] {
  return mode === "call" && selectedIdentity.key === "String.constructor"
    ? stringConstructorCallTargetMembers
    : [];
}

function stringHelperMemberMetadata(row: StringHelperMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: row.declaringType ?? stringHelperType,
    static: true,
    ...(row.receiverPassing === undefined ? {} : { receiverPassing: row.receiverPassing }),
    capabilityId: stringCapabilityId,
    requiredFacts: row.requiredFacts ?? stringRequiredFacts,
    semanticEquivalence: row.semanticEquivalence ?? "Selected Tsonic.CSharp.Js.String runtime member preserves ECMAScript String operation semantics for closed string carriers.",
  };
}

function stringReceiverHelperMemberMetadata(row: Omit<StringHelperMetadataRow, "receiverPassing">): JsSurfaceTargetMemberMetadata {
  return stringHelperMemberMetadata({ ...row, receiverPassing: "first-argument" });
}
