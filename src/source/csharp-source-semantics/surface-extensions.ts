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
  recordCsharpSourceLibraryCallFactsBeforeFinalization,
} from "./surfaces/js/calls.js";
import {
  recordCsharpSourceLibraryPropertyFactsBeforeFinalization,
} from "./surfaces/js/properties.js";
import {
  recordCsharpJsArrayCarrierFactsBeforeFinalization,
} from "./surfaces/js/array-carrier-lifecycle.js";
import {
  recordCsharpJsArrayElementAccessFactsBeforeFinalization,
} from "./surfaces/js/arrays.js";
import {
  recordCsharpJsArrayMutationFactsBeforeFinalization,
} from "./surfaces/js/array-mutations.js";
import {
  recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization,
} from "./surfaces/js/dictionary-lifecycle.js";
import {
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/regexp.js";
import {
  recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/date.js";
import {
  recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/json.js";
import {
  recordCsharpJsSurfaceIterationFactsBeforeFinalization,
} from "./surfaces/js/iteration.js";

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
  hosts: CsharpExtensionSemanticHosts,
): void {
  if (targetHasSurface(context, "js")) {
    const jsSurfaceHost = createCsharpJsSurfaceHost("tsonic.csharp.js.operations", hosts.operationsProviderHost);
    recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
    recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
    recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpJsArrayCarrierFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
  }
}

export function recordCsharpSelectedSurfaceOperationFactsBeforeFinalization(
  context: TargetProviderContext,
  lifecycleContext: CsharpSurfaceLifecycleContext,
  hosts: CsharpExtensionSemanticHosts,
): void {
  if (targetHasSurface(context, "js")) {
    const jsSurfaceHost = createCsharpJsSurfaceHost("tsonic.csharp.js.operations", hosts.operationsProviderHost);
    recordCsharpSourceLibraryPropertyFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpJsArrayElementAccessFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpJsArrayMutationFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpSourceLibraryCallFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpJsSurfaceIterationFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
    recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
  }
}

function targetHasSurface(context: TargetProviderContext, surfaceId: string): boolean {
  return context.selectedSurfaces.some((surface) => surface.id === surfaceId);
}
