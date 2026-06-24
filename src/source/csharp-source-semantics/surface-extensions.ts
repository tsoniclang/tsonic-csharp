import type {
  ExtensionInitializeContext,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  TargetProviderContext,
} from "@tsonic/target-api";
import {
  createCsharpJsSurfaceHost,
} from "./operations-provider.js";
import {
  type CsharpExtensionSemanticHosts,
} from "./semantic-hosts.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./surfaces/nodejs/index.js";
import {
  recordCsharpJsArrayElementAccessFactsBeforeFinalization,
} from "./surfaces/js/arrays.js";
import {
  recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization,
} from "./surfaces/js/dictionary-lifecycle.js";
import {
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/regexp.js";

type CsharpSurfaceLifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export function registerCsharpSelectedSurfaceProviders(
  context: TargetProviderContext,
  extensionContext: ExtensionInitializeContext,
): void {
  if (targetHasSurface(context, "nodejs")) {
    extensionContext.registerTargetBindingProvider(createCsharpNodejsSurfaceBindingProvider());
  }
}

export function recordCsharpSelectedSurfaceSeedFactsBeforeFinalization(
  context: TargetProviderContext,
  lifecycleContext: CsharpSurfaceLifecycleContext,
): void {
  if (targetHasSurface(context, "js")) {
    recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  }
}

export function recordCsharpSelectedSurfaceOperationFactsBeforeFinalization(
  context: TargetProviderContext,
  lifecycleContext: CsharpSurfaceLifecycleContext,
  hosts: CsharpExtensionSemanticHosts,
): void {
  if (targetHasSurface(context, "js")) {
    const jsSurfaceHost = createCsharpJsSurfaceHost("tsonic.csharp.js.operations", hosts.operationsProviderHost);
    recordCsharpJsArrayElementAccessFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
  }
}

function targetHasSurface(context: TargetProviderContext, surfaceId: string): boolean {
  return context.selectedSurfaces.some((surface) => surface.id === surfaceId);
}
