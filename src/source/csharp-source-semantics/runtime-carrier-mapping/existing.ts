import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
} from "@tsonic/tsts";

export function getExistingRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext,
): RuntimeCarrierFactResult["carrier"] | undefined {
  return context.facts.get(request.type, runtimeCarrierFactKey)?.carrier ??
    (request.sourceTypeReference === undefined
      ? undefined
      : context.facts.get(request.sourceTypeReference, runtimeCarrierFactKey)?.carrier) ??
    (request.sourceSymbol === undefined
      ? undefined
      : context.facts.get(request.sourceSymbol, runtimeCarrierFactKey)?.carrier);
}
