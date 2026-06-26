import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../arrays.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  getSourceLibraryCallReceiverTargetTypes,
} from "./helpers.js";

export function selectSourceLibraryCallMember(
  _sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  const selected = host.selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
    sourceSelectedSignature: request.sourceSelectedSignature,
  }, context, sourceLibraryCallSelectionOptions(request, context, _sourceMember, host));
  return selected !== undefined &&
    (!targetMemberSelectionRequiresSelectedSourceSignature(candidates) || request.sourceSelectedSignature !== undefined)
    ? selected
    : undefined;
}

export function sourceLibraryCallSelectionOptions(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  _sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): Parameters<CsharpJsSurfaceHost["selectTargetMember"]>[3] {
  const receiverType = getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .find((candidate) => getCsharpArrayLikeElementType(candidate) !== undefined);
  return receiverType === undefined
    ? {}
    : {
        declaringTargetType: receiverType,
        declaringTypeParameters: [{ name: "T" }],
      };
}

function targetMemberSelectionRequiresSelectedSourceSignature(candidates: readonly TargetMember[]): boolean {
  return candidates.length > 1;
}
