import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
  isCsharpJsArrayCarrierTargetType,
} from "../arrays.js";
import {
  isCsharpJsDateRuntimeCarrier,
} from "../date.js";
import {
  isCsharpBooleanTargetType,
} from "../booleans.js";
import {
  isCsharpNumberTargetType,
  numberStaticCallRequiresNoReceiver,
} from "../numbers.js";
import {
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "../collections.js";
import {
  isCsharpJsJsonValueTargetType,
} from "../json.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "../objects.js";
import {
  getCsharpJsRegExpRuntimeCarrierForSubject,
  isCsharpJsRegExpRuntimeCarrier,
} from "../regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
  isNumericSourcePrimitive,
  isStringKeyedRecordDictionaryTargetType,
} from "./helpers.js";

export function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.declaringName === "Object") {
    return sourceLibraryObjectCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (sourceMember.declaringName === "JSON") {
    return sourceLibraryJsonCallHasClosedFacts(request, context, sourceMember, host);
  }
  if (!sourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  const receiverTypes = getSourceLibraryCallReceiverTargetTypes(request, context, host);
  switch (sourceMember.declaringName) {
    case "Array":
      if (sourceMember.memberName === "concat" && getSourceLibraryCallArgumentTargetTypes(request, context, host).some((argumentType) => argumentType === undefined)) {
        return false;
      }
      return sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember) ||
        receiverTypes.some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
    case "ReadonlyArray":
      return receiverTypes.some((receiverType) => getCsharpArrayLikeElementType(receiverType) !== undefined);
    case "String":
      return receiverTypes.some((receiverType) => host.isCsharpStringType(receiverType));
    case "Number":
      return receiverTypes.some((receiverType) => isCsharpNumberTargetType(receiverType));
    case "Boolean":
      return receiverTypes.some((receiverType) => isCsharpBooleanTargetType(receiverType));
    case "RegExp":
      return receiverTypes.some((receiverType) => isCsharpJsRegExpRuntimeCarrier(receiverType)) ||
        getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiver, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverSymbol, context) !== undefined ||
        getCsharpJsRegExpRuntimeCarrierForSubject(request.calleeReceiverResolvedSymbol, context) !== undefined;
    case "Date":
      return sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember) ||
        request.sourceSelectedDeclaration !== undefined ||
        receiverTypes.some((receiverType) => isCsharpJsDateRuntimeCarrier(receiverType));
    case "Map":
    case "ReadonlyMap":
      return sourceMember.memberName === "constructor" ||
        receiverTypes.some((receiverType) => isCsharpJsMapTargetType(receiverType));
    case "Set":
    case "ReadonlySet":
      return sourceMember.memberName === "constructor" ||
        receiverTypes.some((receiverType) => isCsharpJsSetTargetType(receiverType));
    default:
      return true;
  }
}

function sourceLibraryJsonCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.memberName) {
    case "parse":
      return host.isCsharpStringType(argumentTypes[0]);
    case "stringify":
      return isSupportedJsonValueTargetType(argumentTypes[0], host);
    default:
      return false;
  }
}

function isSupportedJsonValueTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      host.isCsharpStringType(type) ||
      isNumericSourcePrimitive(type) ||
      (type.kind === "source-primitive" && type.name === "bool") ||
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      isCsharpJsJsonValueTargetType(type)
    );
}

function sourceLibraryObjectCallHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (sourceMember.memberName === "hasOwnProperty") {
    return getSourceLibraryCallReceiverTargetTypes(request, context, host)
      .some((receiverType) => isCsharpJsObjectCarrierTargetType(receiverType));
  }
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  switch (sourceMember.memberName) {
    case "keys":
    case "values":
    case "entries":
      return isSupportedObjectHelperSourceTargetType(argumentTypes[0], host);
    case "hasOwn":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        host.isCsharpStringType(argumentTypes[1]);
    case "assign":
      return isCsharpJsObjectCarrierTargetType(argumentTypes[0]) &&
        argumentTypes.slice(1).every((argumentType) => isSupportedObjectHelperSourceTargetType(argumentType, host));
    default:
      return true;
  }
}

function isSupportedObjectHelperSourceTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      type.kind === "source-primitive" ||
      host.isCsharpStringType(type) ||
      isStringKeyedRecordDictionaryTargetType(type, host)
    );
}

function sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Array" &&
    (sourceMember.memberName === "constructor" || sourceMember.memberName === "from" || sourceMember.memberName === "of" || sourceMember.memberName === "isArray");
}

function sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Date" &&
    (
      sourceMember.memberName === "constructor" ||
      sourceMember.memberName === "now" ||
      sourceMember.memberName === "parse" ||
      sourceMember.memberName === "UTC"
    );
}

function sourceLibraryCallRequiresClosedReceiver(sourceMember: SourceLibraryMember): boolean {
  switch (sourceMember.declaringName) {
    case "Array":
      return !sourceLibraryArrayStaticCallRequiresNoReceiver(sourceMember);
    case "ReadonlyArray":
      return true;
    case "String":
      return sourceMember.memberName !== "fromCharCode" && sourceMember.memberName !== "fromCodePoint";
    case "Number":
      return !numberStaticCallRequiresNoReceiver(sourceMember.memberName);
    case "Boolean":
      return true;
    case "RegExp":
      return sourceMember.memberName !== "constructor";
    case "Date":
      return !sourceLibraryDateStaticCallRequiresNoReceiver(sourceMember);
    case "Object":
      return sourceMember.memberName === "hasOwnProperty";
    case "Map":
    case "ReadonlyMap":
    case "Set":
    case "ReadonlySet":
      return sourceMember.memberName !== "constructor";
    default:
      return false;
  }
}
