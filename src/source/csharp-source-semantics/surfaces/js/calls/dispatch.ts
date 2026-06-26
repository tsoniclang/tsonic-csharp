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
  getSignatureDeclaration,
} from "./declaration-identity.js";
import {
  csharpJsSourceLibraryCallCanWaitForFinalizedFacts,
  csharpJsSourceLibraryCallMayNeedFinalFacts,
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
  rejectSourceLibraryCallSignatureDeclarationMismatch,
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
  selectSourceLibraryCallMember,
} from "./selection.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const signatureDeclaration = getSignatureDeclaration(request.sourceSelectedSignature);
  const sourceMember = getSourceLibraryMember(signatureDeclaration ?? request.sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return undefined;
  }
  if (signatureDeclaration === undefined) {
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  if (
    request.sourceSelectedDeclaration !== undefined &&
    signatureDeclaration !== request.sourceSelectedDeclaration
  ) {
    return rejectSourceLibraryCallSignatureDeclarationMismatch(sourceMember, host);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryCall(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  const consoleCall = mapCsharpJsConsoleCheckedCall(request, context, sourceMember, host, options);
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
  const selectedMember = selectSourceLibraryCallMember(sourceMember, candidates, request, context, host);
  if (!sourceLibraryCallReceiverHasClosedFacts(request, context, sourceMember, host)) {
    if (csharpJsSourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase)) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutClosedFacts(sourceMember, host);
  }
  const callMayNeedFinalFacts = csharpJsSourceLibraryCallMayNeedFinalFacts(sourceMember, options.phase);
  if (selectedMember === undefined && request.sourceSelectedSignature === undefined) {
    if (canWaitForFinalizedFacts || callMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallMissingSelectedSignature(sourceMember, host);
  }
  const member = selectedMember;
  if (member === undefined) {
    if (canWaitForFinalizedFacts || callMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutUniqueTargetMember(sourceMember, host);
  }
  return acceptSourceLibraryCheckedCall(request, sourceMember, member, context);
}
