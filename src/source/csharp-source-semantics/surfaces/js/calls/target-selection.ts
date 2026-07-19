import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMemberKey,
} from "../source-library.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../../../checked-call-request-context.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverClosedTargetTypes,
} from "./helpers.js";
import {
  csharpTargetMemberFact,
} from "../../../target-types.js";
import {
  targetTypeRefEquals,
} from "../../../target-ref-utils.js";
import {
  targetArityMatches,
} from "../../../target-member-arguments/arity.js";
import {
  getApplicableSourceCallEvidence,
} from "../../../selected-source-evidence.js";

export function selectSourceLibraryCallMember(
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  sourceSelectionProven: boolean,
  selectedSourceIdentity: SourceLibraryMemberKey,
): TargetMember | undefined {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const selected = host.selectTargetMember(candidates, {
    arguments: request.arguments,
    argumentTargetTypes: getSourceLibraryCallArgumentTargetTypes(request, context, host),
    receiver: requestContext.calleeReceiver,
    receiverTargetType: getSourceLibraryCallReceiverClosedTargetTypes(request, context)[0],
    ...(sourceSelectionProven ? { sourceSelectionProven: true } : {}),
    sourceSelectedIdentity: selectedSourceIdentity,
  }, context);
  return selected !== undefined && sourceSelectionProven ? selected : undefined;
}

export function selectDeferredCanonicalSourceLibraryCallMember(
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  selectedSourceIdentity: SourceLibraryMemberKey,
): TargetMember | undefined {
  const canonicalCandidates = candidates.filter((candidate) =>
    csharpTargetMemberFact(candidate)?.csharpDeferredTargetSelection?.variant === "canonical" &&
    csharpTargetMemberFact(candidate)?.sourceIdentityKeys?.includes(selectedSourceIdentity) === true);
  if (canonicalCandidates.length === 0) {
    return undefined;
  }
  const receiverTypes = canonicalCandidates.map((candidate) =>
    csharpTargetMemberFact(candidate)?.receiverPassing === "first-argument"
      ? csharpTargetMemberFact(candidate)?.parameters[0]?.type
      : undefined);
  const canonicalReceiverType = receiverTypes[0];
  if (canonicalReceiverType === undefined || receiverTypes.some((type) => type === undefined || !targetTypeRefEquals(type, canonicalReceiverType))) {
    return canonicalCandidates.length === 1 ? canonicalCandidates[0] : undefined;
  }
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const selected = host.selectTargetMember(canonicalCandidates, {
    arguments: request.arguments,
    argumentTargetTypes: getSourceLibraryCallArgumentTargetTypes(request, context, host),
    receiver: requestContext.calleeReceiver,
    receiverTargetType: canonicalReceiverType,
    sourceSelectionProven: true,
    sourceSelectedIdentity: selectedSourceIdentity,
  }, context);
  if (selected !== undefined) {
    return selected;
  }
  if (getApplicableSourceCallEvidence(request) === undefined) {
    return undefined;
  }
  const arityMatched = canonicalCandidates.filter((candidate) => {
    const member = csharpTargetMemberFact(candidate);
    if (member === undefined) {
      return false;
    }
    const argumentCount = request.arguments.length + (member.receiverPassing === "first-argument" ? 1 : 0);
    return targetArityMatches(member.parameters, argumentCount);
  });
  return arityMatched.length === 1 ? arityMatched[0] : undefined;
}
