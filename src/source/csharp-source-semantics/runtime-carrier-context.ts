import {
  ExtensionObservationPoint,
} from "@tsonic/tsts";
import type {
  CompilerExtension,
  ExtensionObservationContext,
  ExtensionObservationPointName,
} from "@tsonic/tsts";
import {
  csharpTargetSemanticsExtensionId,
} from "./identity.js";

export type CsharpLifecycleObservationContext =
  Parameters<NonNullable<CompilerExtension["initialize"]>>[0] extends never
    ? never
    : {
        readonly host: ExtensionObservationContext["host"];
        readonly compiler?: ExtensionObservationContext["compiler"];
      };

export function createRuntimeCarrierLifecycleObservationContext(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): ExtensionObservationContext<typeof ExtensionObservationPoint.resolveRuntimeCarrier> {
  return createCsharpLifecycleObservationContext(
    lifecycleContext,
    ExtensionObservationPoint.resolveRuntimeCarrier,
  );
}

export function createCsharpLifecycleObservationContext<
  TObservation extends ExtensionObservationPointName,
>(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  observation: TObservation,
): ExtensionObservationContext<TObservation> {
  return {
    observation,
    extensionId: csharpTargetSemanticsExtensionId,
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    ...(lifecycleContext.compiler !== undefined ? { compiler: lifecycleContext.compiler } : {}),
  };
}
