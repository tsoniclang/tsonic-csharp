import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";

export function selectSourceLibraryCallMember(
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  const selected = host.selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
    sourceSelectedSignature: request.sourceSelectedSignature,
  }, context);
  return selected !== undefined && request.sourceSelectedSignature !== undefined ? selected : undefined;
}
