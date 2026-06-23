import {
  ExtensionObservationPoint,
} from "@tsonic/tsts";
import type {
  CompilerExtension,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpNativeProviderExtensionId,
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
  return {
    observation: ExtensionObservationPoint.resolveRuntimeCarrier,
    extensionId: csharpNativeProviderExtensionId,
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    ...(lifecycleContext.compiler !== undefined ? { compiler: lifecycleContext.compiler } : {}),
  };
}
