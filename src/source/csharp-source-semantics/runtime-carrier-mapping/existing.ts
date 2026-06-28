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
  return context.facts.get(request.type, runtimeCarrierFactKey)?.carrier;
}
