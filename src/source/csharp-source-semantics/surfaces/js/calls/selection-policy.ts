import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
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
    (!targetMemberCandidatesRequireSelectedSourceSignature(candidates) || request.sourceSelectedSignature !== undefined)
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

function targetMemberCandidatesRequireSelectedSourceSignature(candidates: readonly TargetMember[]): boolean {
  return candidates.length > 1 && candidates.some((candidate) =>
    candidate.parameters.some((parameter) => targetParameterIsDelegate(parameter))
  );
}

function targetParameterIsDelegate(parameter: TargetParameter): boolean {
  return targetTypeIsDelegate(parameter.type);
}

function targetTypeIsDelegate(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpDelegateSignature?: unknown }).csharpDelegateSignature !== undefined;
}
