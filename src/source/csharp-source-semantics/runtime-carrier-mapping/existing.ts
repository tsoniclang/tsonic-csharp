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
  const direct = context.facts.get(request.sourceTypeReference, runtimeCarrierFactKey)?.carrier ??
    context.facts.get(request.sourceTypeSymbol, runtimeCarrierFactKey)?.carrier;
  if (direct !== undefined) {
    return direct;
  }
  return request.sourceTypeReference !== undefined || request.sourceTypeSymbol !== undefined
    ? undefined
    : context.facts.get(request.type, runtimeCarrierFactKey)?.carrier;
}
