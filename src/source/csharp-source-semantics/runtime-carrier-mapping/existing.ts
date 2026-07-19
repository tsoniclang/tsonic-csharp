import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
} from "@tsonic/tsts";
import {
  csharpRuntimeCarrierFactKey,
} from "../../csharp-facts.js";

export function getExistingRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext,
): RuntimeCarrierFactResult["carrier"] | undefined {
  for (const subject of [request.type, request.sourceTypeReference, request.sourceSymbol]) {
    if (subject === undefined) {
      continue;
    }
    const carrier = context.facts.get(subject, csharpRuntimeCarrierFactKey)?.carrier ??
      context.factResolver.resolve(subject, csharpRuntimeCarrierFactKey)?.carrier;
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}
