import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
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
  csharpJsCheckedTypeQuery,
} from "./source-library.js";
import {
  mapCsharpJsStringElementAccess,
} from "./strings.js";

export function mapCsharpSourceLibraryCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const receiverType = host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, csharpJsCheckedTypeQuery) ??
      host.getTargetTypeRefForSubject(request.receiver, context, csharpJsCheckedTypeQuery),
  );
  const semanticReceiverType = receiverType ?? host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiverType, context, { allowRuntimeCarrier: false }) ??
      host.getTargetTypeRefForSubject(request.receiver, context, { allowRuntimeCarrier: false }),
  );
  return mapCsharpJsArrayElementAccess(request, context, receiverType, host) ??
    mapCsharpJsRecordDictionaryElementAccess(request, context, semanticReceiverType, host) ??
    mapCsharpJsStringElementAccess(request, context, receiverType, host);
}
