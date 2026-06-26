import {
  acceptObservation,
  rejectObservation,
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
  SourceLibraryMember,
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
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMembersForSourceMember,
} from "./target-member-metadata.js";

export function mapCsharpJsStringElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!host.isCsharpStringType(receiverType)) {
    return undefined;
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
    operation: targetOperation("tsonic.csharp.js.string.codeUnit", "indexer", "String.Substring", {
      resultType: csharpStringTargetType(),
    }),
  }, [{ message: "C# JS surface string code-unit access selected from checked TypeScript element access." }]);
}

export function stringTargetMembersForSourceMember(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceMember(stringTargetMemberIdentityIndex, sourceMember);
}

const stringType = csharpStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringHelperType = csharpTargetNamedType("Tsonic.CSharp.Js.String", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "String"));
const stringReceiverParameter = targetParameter("value", stringType);
const stringSearchParameter = targetParameter("search", stringType);
const stringPositionParameter = targetParameter("position", intType, { optional: true });
const stringIndexParameter = targetParameter("index", intType);
const stringTargetMemberMetadata = [
  {
    id: "System.String.ToString",
    sourceName: "toString",
    targetName: "ToString",
    kind: "method",
    returnType: stringType,
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
  },
  ...["fromCharCode", "fromCodePoint"].map((sourceName) =>
    stringHelperMemberMetadata(sourceName, [targetParameter("code", intType, { paramsArray: true })], stringType)
  ),
  ...["includes", "startsWith", "endsWith"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [stringReceiverParameter, stringSearchParameter, stringPositionParameter], boolType)
  ),
  stringReceiverHelperMemberMetadata("isWellFormed", [stringReceiverParameter], boolType),
  ...["indexOf", "lastIndexOf"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [stringReceiverParameter, stringSearchParameter, stringPositionParameter], intType)
  ),
  ...["localeCompare", "search"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [stringReceiverParameter, targetParameter("value", stringType)], intType)
  ),
  stringReceiverHelperMemberMetadata("charCodeAt", [stringReceiverParameter, stringIndexParameter], doubleType),
  stringReceiverHelperMemberMetadata("at", [stringReceiverParameter, stringIndexParameter], csharpNullableTargetType(stringType)),
  stringReceiverHelperMemberMetadata("codePointAt", [stringReceiverParameter, stringIndexParameter], csharpNullableValueTargetType(intType)),
  stringReceiverHelperMemberMetadata("split", [
    stringReceiverParameter,
    targetParameter("separator", stringType),
    targetParameter("limit", intType, { optional: true }),
  ], csharpListTargetType(stringType)),
  ...["replace", "replaceAll"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [
      stringReceiverParameter,
      stringSearchParameter,
      targetParameter("replacement", stringType),
    ], stringType)
  ),
  ...["substring", "slice", "substr"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [
      stringReceiverParameter,
      targetParameter("start", intType),
      targetParameter("end", intType, { optional: true }),
    ], stringType)
  ),
  ...["padStart", "padEnd"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [
      stringReceiverParameter,
      targetParameter("targetLength", intType),
      targetParameter("padString", stringType, { optional: true }),
    ], stringType)
  ),
  ...["repeat", "charAt"].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [stringReceiverParameter, stringIndexParameter], stringType)
  ),
  stringReceiverHelperMemberMetadata("normalize", [stringReceiverParameter, targetParameter("form", stringType, { optional: true })], stringType),
  ...[
    "trim",
    "trimStart",
    "trimLeft",
    "trimEnd",
    "trimRight",
    "toLowerCase",
    "toLocaleLowerCase",
    "toUpperCase",
    "toLocaleUpperCase",
    "toWellFormed",
    "valueOf",
  ].map((sourceName) =>
    stringReceiverHelperMemberMetadata(sourceName, [stringReceiverParameter], stringType)
  ),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const stringTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("String", stringTargetMemberMetadata);

function stringHelperMemberMetadata(
  sourceName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.String.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: stringHelperType,
    static: true,
  };
}

function stringReceiverHelperMemberMetadata(
  sourceName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    ...stringHelperMemberMetadata(sourceName, parameters, returnType),
    receiverPassing: "first-argument",
  };
}
