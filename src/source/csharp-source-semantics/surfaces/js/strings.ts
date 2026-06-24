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
import type { CsharpJsSurfaceHost } from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetMethod,
  targetOperation,
  targetParameter,
} from "./source-library.js";

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

export function getStringTargetMembers(sourceName: string): readonly TargetMember[] {
  const stringType = csharpStringTargetType();
  const intType = csharpSourcePrimitiveTargetType("int32");
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const instanceName = stringInstanceTargetNames.get(sourceName);
  if (instanceName !== undefined) {
    return [targetMethod(`System.String.${instanceName}`, sourceName, instanceName, [], stringType)];
  }
  if (sourceName === "concat") {
    return [targetMethod("tsonic.csharp.js.String.concat", sourceName, "Concat", [
      targetParameter("value", stringType),
      targetParameter("values", stringType, { paramsArray: true }),
    ], stringType, {
      declaringType: stringType,
      static: true,
      receiverPassing: "first-argument",
    })];
  }
  if (!stringHelperNames.has(sourceName)) {
    return [];
  }
  const helperType = csharpTargetNamedType("Tsonic.CSharp.Js.String", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "String"));
  const returnType = getStringHelperReturnType(sourceName, stringType, intType, doubleType, boolType);
  const parameters = getStringHelperParameters(sourceName, stringType, intType);
  const isStaticConstructor = sourceName === "fromCharCode" || sourceName === "fromCodePoint";
  return [targetMethod(`Tsonic.CSharp.Js.String.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType: helperType,
    static: true,
    ...(isStaticConstructor ? {} : { receiverPassing: "first-argument" }),
  })];
}

const stringInstanceTargetNames = new Map<string, string>([
  ["toString", "ToString"],
  ["trim", "Trim"],
  ["trimStart", "TrimStart"],
  ["trimLeft", "TrimStart"],
  ["trimEnd", "TrimEnd"],
  ["trimRight", "TrimEnd"],
  ["toLowerCase", "ToLower"],
  ["toUpperCase", "ToUpper"],
]);

const stringHelperNames = new Set([
  "at",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "endsWith",
  "fromCharCode",
  "fromCodePoint",
  "includes",
  "indexOf",
  "isWellFormed",
  "lastIndexOf",
  "localeCompare",
  "normalize",
  "padEnd",
  "padStart",
  "repeat",
  "replace",
  "replaceAll",
  "slice",
  "split",
  "startsWith",
  "substr",
  "substring",
  "search",
  "toLocaleLowerCase",
  "toLocaleUpperCase",
  "toWellFormed",
  "valueOf",
]);

function getStringHelperReturnType(sourceName: string, stringType: TargetTypeRef, intType: TargetTypeRef, doubleType: TargetTypeRef, boolType: TargetTypeRef): TargetTypeRef {
  switch (sourceName) {
    case "includes":
    case "startsWith":
    case "endsWith":
    case "isWellFormed":
      return boolType;
    case "indexOf":
    case "lastIndexOf":
    case "localeCompare":
    case "search":
      return intType;
    case "charCodeAt":
      return doubleType;
    case "codePointAt":
      return csharpNullableValueTargetType(intType);
    case "split":
      return { kind: "array", element: stringType };
    default:
      return stringType;
  }
}

function getStringHelperParameters(sourceName: string, stringType: TargetTypeRef, intType: TargetTypeRef): readonly TargetParameter[] {
  const receiver = targetParameter("value", stringType);
  switch (sourceName) {
    case "fromCharCode":
    case "fromCodePoint":
      return [targetParameter("code", intType, { paramsArray: true })];
    case "includes":
    case "startsWith":
    case "endsWith":
    case "indexOf":
    case "lastIndexOf":
      return [receiver, targetParameter("search", stringType), targetParameter("position", intType, { optional: true })];
    case "replace":
    case "replaceAll":
      return [receiver, targetParameter("search", stringType), targetParameter("replacement", stringType)];
    case "substring":
    case "slice":
    case "substr":
      return [receiver, targetParameter("start", intType), targetParameter("end", intType, { optional: true })];
    case "padStart":
    case "padEnd":
      return [receiver, targetParameter("targetLength", intType), targetParameter("padString", stringType, { optional: true })];
    case "repeat":
    case "charAt":
    case "at":
    case "charCodeAt":
    case "codePointAt":
      return [receiver, targetParameter("index", intType)];
    case "split":
      return [receiver, targetParameter("separator", stringType), targetParameter("limit", intType, { optional: true })];
    case "localeCompare":
    case "search":
      return [receiver, targetParameter("value", stringType)];
    case "normalize":
      return [receiver, targetParameter("form", stringType, { optional: true })];
    case "toLocaleLowerCase":
    case "toLocaleUpperCase":
    case "isWellFormed":
    case "toWellFormed":
    case "valueOf":
      return [receiver];
    default:
      return [receiver];
  }
}
