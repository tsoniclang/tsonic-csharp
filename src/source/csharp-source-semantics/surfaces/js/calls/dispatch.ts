import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  mapCsharpJsConsoleCheckedCall,
} from "../console.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  getSourceLibraryMember,
} from "../source-library.js";
import {
  rejectUnmappedCsharpJsSourceLibraryCall,
  rejectUnsupportedCsharpJsSourceLibraryCall,
} from "../unsupported.js";
import {
  sourceLibraryCallReceiverHasClosedFacts,
} from "./closed-facts.js";
import {
  rejectSourceLibraryCallMissingSelectedSignature,
  rejectSourceLibraryCallWithoutClosedFacts,
  rejectSourceLibraryCallWithoutUniqueTargetMember,
} from "./diagnostics.js";
import {
  getSourceLibraryCallMembers,
} from "./members.js";
import {
  acceptSourceLibraryCheckedCall,
} from "./operations.js";
import {
  getPrevalidatedSourceLibraryCallMember,
  sourceLibraryCallSelectionOptions,
} from "./selection.js";

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
  const candidates = getSourceLibraryCallMembers(sourceMember, request, context, host);
  if (candidates.length === 0) {
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  const prevalidatedMember = getPrevalidatedSourceLibraryCallMember(sourceMember, candidates, request, context, host);
  if (sourceMember.declaringName === "Date" && prevalidatedMember === undefined) {
    return undefined;
  }
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    return rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host);
  }
  if (candidates.length > 1 && request.sourceSelectedSignature === undefined && prevalidatedMember === undefined) {
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  const member = prevalidatedMember ??
    host.selectTargetMember(candidates, {
      arguments: request.arguments,
      receiver: request.calleeReceiver,
    }, context, sourceLibraryCallSelectionOptions(request, context, sourceMember, host));
  if (member === undefined) {
    return rejectSourceLibraryCallWithoutUniqueTargetMember(sourceMember, host);
  }
  return acceptSourceLibraryCheckedCall(request, sourceMember, member, context);
}
