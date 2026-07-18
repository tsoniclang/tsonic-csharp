import {
  ExtensionObservationPoint,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  ImmediateExtensionObservationContext,
  ImmediateExtensionObservationPointName,
} from "@tsonic/tsts";
import {
  csharpTargetSemanticsExtensionId,
} from "./identity.js";

export type CsharpLifecycleObservationContext = Pick<ExtensionLifecycleContext, "host" | "compiler">;

export function createRuntimeCarrierLifecycleObservationContext(
  lifecycleContext: CsharpLifecycleObservationContext,
): ImmediateExtensionObservationContext<typeof ExtensionObservationPoint.resolveRuntimeCarrier> {
  return createCsharpLifecycleObservationContext(
    lifecycleContext,
    ExtensionObservationPoint.resolveRuntimeCarrier,
  );
}

export function createCsharpLifecycleObservationContext<
  TObservation extends ImmediateExtensionObservationPointName,
>(
  lifecycleContext: CsharpLifecycleObservationContext,
  observation: TObservation,
): ImmediateExtensionObservationContext<TObservation> {
  return {
    observation,
    phase: "finalization",
    extensionId: csharpTargetSemanticsExtensionId,
    compiler: lifecycleContext.compiler,
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
  };
}
