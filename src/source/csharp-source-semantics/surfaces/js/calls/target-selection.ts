import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../../../checked-call-request-context.js";
import {
  getSourceLibraryCallArgumentTargetTypes,
  getSourceLibraryCallReceiverTargetTypes,
} from "./helpers.js";

export function selectSourceLibraryCallMember(
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  selectedSourceSignature: unknown,
): TargetMember | undefined {
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const selected = host.selectTargetMember(candidates, {
    arguments: request.arguments,
    argumentTargetTypes: getSourceLibraryCallArgumentTargetTypes(request, context, host),
    receiver: requestContext.calleeReceiver,
    receiverTargetType: getSourceLibraryCallReceiverTargetTypes(request, context, host)[0],
    sourceSelectedSignature: selectedSourceSignature,
  }, context);
  return selected !== undefined && selectedSourceSignature !== undefined ? selected : undefined;
}
