import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpArrayBoundaryFactKey,
} from "../../../csharp-facts.js";

export function getCsharpArrayBoundaryCoreCarrier(
  subject: ExtensionFactSubject | undefined,
  context: Pick<ExtensionObservationContext, "facts" | "factResolver">,
): TargetTypeRef | undefined {
  return subject === undefined
    ? undefined
    : (context.factResolver.resolve(subject, csharpArrayBoundaryFactKey) ??
      context.facts.get(subject, csharpArrayBoundaryFactKey))?.coreCarrierType;
}

export function getCsharpArrayBoundaryCoreCarrierForReference(
  subject: ExtensionFactSubject | undefined,
  context: Pick<ExtensionObservationContext, "facts" | "factResolver">,
): TargetTypeRef | undefined {
  return getCsharpArrayBoundaryCoreCarrier(subject, context);
}
