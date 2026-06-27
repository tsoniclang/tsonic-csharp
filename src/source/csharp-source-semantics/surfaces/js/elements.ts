import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  mapCsharpJsArrayElementAccess,
} from "./arrays.js";
import {
  mapCsharpJsRecordDictionaryElementAccess,
} from "./dictionaries.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  mapCsharpJsStringElementAccess,
} from "./strings.js";

export function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
  const semanticReceiverType = host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, { allowRuntimeCarrier: false }) ??
      host.getTargetTypeRefForSubject(request.receiver, context, { allowRuntimeCarrier: false }),
  );
  return mapCsharpJsArrayElementAccess(request, context, receiverCarrier, host) ??
    mapCsharpJsRecordDictionaryElementAccess(request, context, receiverCarrier ?? semanticReceiverType, host) ??
    mapCsharpJsStringElementAccess(request, context, receiverCarrier ?? semanticReceiverType, host);
}

function getFinalizedReceiverCarrier(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(request.receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}
