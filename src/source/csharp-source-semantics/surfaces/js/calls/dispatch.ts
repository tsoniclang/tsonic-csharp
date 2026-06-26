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
  csharpJsSourceLibraryCallCanWaitForFinalizedFacts,
  csharpJsSourceLibraryCallMayNeedFinalFacts,
  csharpJsSourceLibraryCallRequiresPrevalidatedMember,
} from "../policy.js";
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
  options: { readonly phase?: "checking" | "finalization" } = {},
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
  const canWaitForFinalizedFacts = csharpJsSourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase);
  const candidates = getSourceLibraryCallMembers(sourceMember, request, context, host);
  if (candidates.length === 0) {
    if (canWaitForFinalizedFacts) {
      return undefined;
    }
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  const prevalidatedMember = getPrevalidatedSourceLibraryCallMember(sourceMember, candidates, request, context, host);
  if (csharpJsSourceLibraryCallRequiresPrevalidatedMember(sourceMember) && prevalidatedMember === undefined) {
    return undefined;
  }
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    if (csharpJsSourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase)) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host);
  }
  const callMayNeedFinalFacts = csharpJsSourceLibraryCallMayNeedFinalFacts(sourceMember, options.phase);
  if (candidates.length > 1 && request.sourceSelectedSignature === undefined && prevalidatedMember === undefined) {
    if (canWaitForFinalizedFacts || callMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  const member = prevalidatedMember ??
    host.selectTargetMember(candidates, {
      arguments: request.arguments,
      receiver: request.calleeReceiver,
  }, context, sourceLibraryCallSelectionOptions(request, context, sourceMember, host));
  if (member === undefined) {
    if (canWaitForFinalizedFacts || callMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutUniqueTargetMember(sourceMember, host);
  }
  return acceptSourceLibraryCheckedCall(request, sourceMember, member, context);
}
