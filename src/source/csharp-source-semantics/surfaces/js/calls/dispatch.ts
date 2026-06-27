import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  resolveSourceLibraryMemberIdentity,
} from "../source-library.js";
import {
  getSignatureDeclaration,
} from "./declaration-identity.js";
import {
  csharpJsSourceLibraryCallCanWaitForFinalizedFacts,
  csharpJsSourceLibraryCallMayNeedFinalFacts,
  sourceLibraryCallReceiverHasClosedFacts,
} from "./closed-facts/index.js";
import {
  rejectUnmappedCsharpJsSourceLibraryCall,
  rejectUnsupportedCsharpJsSourceLibraryCall,
} from "../unsupported.js";
import {
  rejectSourceLibraryCallMissingSelectedSignature,
  rejectSourceLibraryCallSignatureDeclarationMismatch,
  rejectSourceLibraryCallWithoutClosedArgumentFacts,
  rejectSourceLibraryCallWithoutClosedFacts,
  rejectSourceLibraryCallWithoutUniqueTargetMember,
} from "./diagnostics.js";
import {
  getSourceLibraryCallMembers,
} from "./members.js";
import {
  getCsharpJsSourceLibraryUnsupportedOperation,
} from "./member-providers/index.js";
import {
  acceptSourceLibraryCheckedCall,
} from "./operations.js";
import {
  selectSourceLibraryCallMember,
} from "./selection.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
} from "./helpers.js";

export function mapCsharpSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  const signatureDeclaration = getSignatureDeclaration(request.sourceSelectedSignature);
  const sourceMember = resolveSourceLibraryMemberIdentity(signatureDeclaration ?? request.sourceSelectedDeclaration, context);
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
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryCall(
    sourceMember,
    host,
    getCsharpJsSourceLibraryUnsupportedOperation(sourceMember),
  );
  if (unsupported !== undefined) {
    return unsupported;
  }
  const canWaitForFinalizedFacts = csharpJsSourceLibraryCallCanWaitForFinalizedFacts(request, context, sourceMember, host, options.phase);
  const candidates = getSourceLibraryCallMembers(sourceMember, request, context, host);
  if (candidates.length === 0) {
    if (canWaitForFinalizedFacts) {
      return undefined;
    }
    return rejectUnmappedCsharpJsSourceLibraryCall(sourceMember, host);
  }
  const selectedMember = selectSourceLibraryCallMember(candidates, request, context, host);
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
    const missingArgumentFactIndex = getSourceLibraryCallMissingArgumentFactIndex(request, context, host);
    if (missingArgumentFactIndex !== undefined) {
      return rejectSourceLibraryCallWithoutClosedArgumentFacts(sourceMember, host, missingArgumentFactIndex);
    }
    if (canWaitForFinalizedFacts || callMayNeedFinalFacts) {
      return undefined;
    }
    return rejectSourceLibraryCallWithoutUniqueTargetMember(sourceMember, host);
  }
  return acceptSourceLibraryCheckedCall(request, sourceMember, member, context);
}

function getSourceLibraryCallMissingArgumentFactIndex(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): number | undefined {
  const argumentTypes = getSourceLibraryCallArgumentTargetTypes(request, context, host);
  const index = argumentTypes.findIndex((argumentType) => argumentType === undefined);
  return index < 0 ? undefined : index;
}
