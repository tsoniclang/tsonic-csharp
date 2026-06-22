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
  getRegExpTargetMembers,
} from "./regexp.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpJsCheckedTypeQuery,
  getSourceLibraryMember,
  getSourceLibraryMemberFromReceiverType,
  getSourceLibraryMemberFromTargetReceiverType,
} from "./source-library.js";
import {
  getStringTargetMembers,
} from "./strings.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const receiverTargetType = host.getTargetTypeRefForSubject(request.calleeReceiverType, context, csharpJsCheckedTypeQuery) ??
    host.getTargetTypeRefForSubject(request.calleeReceiver, context, csharpJsCheckedTypeQuery);
  const sourceMember = getSourceLibraryMember(request.sourceSelectedDeclaration, context) ??
    getSourceLibraryMemberFromReceiverType(request.calleeReceiverType, request.calleePropertyName, context) ??
    getSourceLibraryMemberFromTargetReceiverType(receiverTargetType, request.calleePropertyName, host);
  if (sourceMember === undefined) {
    return undefined;
  }
  const candidates = getSourceLibraryCallMembers(sourceMember);
  if (candidates.length === 0) {
    return undefined;
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

function getSourceLibraryCallMembers(sourceMember: SourceLibraryMember): readonly TargetMember[] {
  switch (sourceMember.declaringName) {
    case "Math":
      return getMathTargetMembers(sourceMember.memberName);
    case "String":
      return getStringTargetMembers(sourceMember.memberName);
    case "RegExp":
      return getRegExpTargetMembers(sourceMember.memberName);
    case "Array":
    case "ReadonlyArray":
      return getArrayTargetMembers(sourceMember.memberName);
    default:
      return [];
  }
}
