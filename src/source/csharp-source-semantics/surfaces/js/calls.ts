import {
  acceptObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  getArrayTargetMembers,
} from "./arrays.js";
import {
  getMathTargetMembers,
} from "./math.js";
import {
  getObjectTargetMembers,
  isCsharpJsObjectCarrierTargetType,
} from "./objects.js";
import {
  mapCsharpJsConsoleCheckedCall,
} from "./console.js";
import {
  getRegExpTargetMembers,
  isCsharpJsRegExpRuntimeCarrier,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  getSourceLibraryMember,
} from "./source-library.js";
import {
  getStringTargetMembers,
} from "./strings.js";
import {
  rejectUnmappedCsharpJsSourceLibraryCall,
  rejectUnsupportedCsharpJsSourceLibraryCall,
} from "./unsupported.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryCall(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  const consoleCall = mapCsharpJsConsoleCheckedCall(request, context, sourceMember, host);
  if (consoleCall !== undefined) {
    return consoleCall;
  }
  const candidates = getSourceLibraryCallMembers(sourceMember);
  if (candidates.length === 0) {
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' because the selected receiver lacks finalized target runtime facts.`));
  }
  if (mathVariadicRuntimeRequiresAtLeastOneArgument(sourceMember) && request.arguments.length === 0) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' to a unique target member from finalized argument facts.`));
  }
  if (candidates.length > 1 && request.sourceSelectedSignature === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE", 9100113, `C# JS surface call '${sourceMember.declaringName}.${sourceMember.memberName}' requires exact selected TypeScript library signature identity because the declaration maps to multiple target members.`));
  }
  const member = host.selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
  }, context);
  if (member === undefined) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceMember.declaringName}.${sourceMember.memberName}' to a unique target member from finalized argument facts.`));
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# JS surface target call selected from checked TypeScript library declaration '${sourceMember.declaringName}.${sourceMember.memberName}'.` }]);
}

function mathVariadicRuntimeRequiresAtLeastOneArgument(sourceMember: SourceLibraryMember): boolean {
  return sourceMember.declaringName === "Math" &&
    (sourceMember.memberName === "max" || sourceMember.memberName === "min");
}

function sourceLibraryCallReceiverHasClosedFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): boolean {
  if (!sourceLibraryCallRequiresClosedReceiver(sourceMember)) {
    return true;
  }
  const receiverType = host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.calleeReceiver, context, csharpJsCheckedTypeQuery),
  );
  switch (sourceMember.declaringName) {
    case "Array":
    case "ReadonlyArray":
      return receiverType?.kind === "array";
    case "String":
      return host.isCsharpStringType(receiverType);
    case "RegExp":
      return isCsharpJsRegExpRuntimeCarrier(receiverType);
    case "Object":
      return isCsharpJsObjectCarrierTargetType(receiverType);
    default:
      return true;
  }
}

function sourceLibraryCallRequiresClosedReceiver(sourceMember: SourceLibraryMember): boolean {
  switch (sourceMember.declaringName) {
    case "Array":
    case "ReadonlyArray":
      return true;
    case "String":
      return sourceMember.memberName !== "fromCharCode" && sourceMember.memberName !== "fromCodePoint";
    case "RegExp":
      return sourceMember.memberName !== "constructor";
    case "Object":
      return sourceMember.memberName === "hasOwnProperty";
    default:
      return false;
  }
}

function getSourceLibraryCallMembers(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "RegExp":
      return getRegExpTargetMembers(sourceMember.memberName);
    case "Object":
      return getObjectTargetMembers(sourceMember.memberName);
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(sourceMember.memberName);
    default:
      return [];
  }
}
