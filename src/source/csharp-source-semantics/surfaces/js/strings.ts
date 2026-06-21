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
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
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
  if (!host.isIntegralTargetTypeRef(indexType) && host.scoreLiteralTargetTypeMatch(csharpSourcePrimitiveTargetType("int32"), request.argument, context) === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic("tsonic.csharp.js-surface-operations", "CSHARP_NON_INTEGRAL_STRING_INDEX", 9100112, "C# JS surface string element access requires an integral provider-backed index type."));
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.string.codeUnit", "indexer", "string-code-unit", {
      resultType: csharpTargetNamedType("System.String"),
    }),
  }, [{ message: "C# JS surface string code-unit access selected from checked TypeScript element access." }]);
}

export function getStringLengthOperation(declaringName: string): CheckedOperationMappingResult["operation"] {
  return targetOperation(`tsonic.csharp.js.${declaringName}.length`, "property", "Length", {
    resultType: csharpSourcePrimitiveTargetType("int32"),
  });
}

export function getStringTargetMembers(sourceName: string): readonly TargetMember[] {
  const stringType = csharpTargetNamedType("System.String");
  const intType = csharpSourcePrimitiveTargetType("int32");
  const doubleType = csharpSourcePrimitiveTargetType("float64");
  const boolType = csharpSourcePrimitiveTargetType("bool");
  const instanceName = stringInstanceTargetNames.get(sourceName);
  if (instanceName !== undefined) {
    return [targetMethod(`System.String.${instanceName}`, sourceName, instanceName, [], stringType)];
  }
  if (sourceName === "concat") {
    return [targetMethod("System.String.Concat(System.String[])", sourceName, "Concat", [
      targetParameter("value", stringType),
      targetParameter("values", stringType, { paramsArray: true }),
    ], stringType, {
      declaringType: csharpTargetNamedType("System.String"),
      static: true,
      receiverPassing: "first-argument",
    })];
  }
  if (!stringHelperNames.has(sourceName)) {
    return [];
  }
  const helperType = csharpTargetNamedType("Tsonic.CSharp.Js.String");
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
  "charAt",
  "charCodeAt",
  "codePointAt",
  "endsWith",
  "fromCharCode",
  "fromCodePoint",
  "includes",
  "indexOf",
  "lastIndexOf",
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
  "valueOf",
]);

function getStringHelperReturnType(sourceName: string, stringType: TargetTypeRef, intType: TargetTypeRef, doubleType: TargetTypeRef, boolType: TargetTypeRef): TargetTypeRef {
  switch (sourceName) {
    case "includes":
    case "startsWith":
    case "endsWith":
      return boolType;
    case "indexOf":
    case "lastIndexOf":
      return intType;
    case "charCodeAt":
      return doubleType;
    case "codePointAt":
      return { kind: "target-named", id: "System.Nullable`1", typeArguments: [intType] };
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
    case "charCodeAt":
    case "codePointAt":
      return [receiver, targetParameter("index", intType)];
    case "split":
      return [receiver, targetParameter("separator", stringType), targetParameter("limit", intType, { optional: true })];
    case "valueOf":
      return [receiver];
    default:
      return [receiver];
  }
}
