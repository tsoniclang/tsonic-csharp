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
import {
  getCsharpCheckedElementAccessRequestContext,
} from "../../checked-member-access-request-context.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";

export function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const receiverCarrier = getFinalizedReceiverCarrier(request, context, host);
  const semanticReceiverType = host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(requestContext.receiverType, context, { allowRuntimeCarrier: false }) ??
      host.getTargetTypeRefForSubject(request.receiver, context, { allowRuntimeCarrier: false }),
  );
  return mapCsharpJsArrayElementAccess(request, context, receiverCarrier, semanticReceiverType, host) ??
    mapCsharpJsRecordDictionaryElementAccess(request, context, receiverCarrier ?? semanticReceiverType, host) ??
    mapCsharpJsStringElementAccess(request, context, receiverCarrier ?? semanticReceiverType, host);
}

function getFinalizedReceiverCarrier(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    getCsharpArrayBoundaryCoreCarrierForReference(request.receiver, context) ??
      context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(request.receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}
