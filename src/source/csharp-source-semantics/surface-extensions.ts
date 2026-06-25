import {
  ExtensionLifecycleEvent,
  TstsProviderContractVersion,
  deferObservation,
} from "@tsonic/tsts";
import type {
  BeforeSemanticsFinalizedLifecycleRequest,
  CompilerExtension,
  ExtensionObservationContext,
  ProviderIdentity,
  TargetSemanticProvider,
} from "@tsonic/tsts";
import type {
  TargetSurfaceExtensionContext,
} from "@tsonic/target-api";
import {
  createCsharpJsSurfaceHost,
} from "./operations-provider.js";
import {
  type CsharpExtensionSemanticHosts,
  getCsharpExtensionSemanticHosts,
} from "./semantic-hosts.js";
import {
  createCsharpJsSurfaceMappers,
} from "./surfaces/js/index.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
  createCsharpNodejsSurfaceMappers,
} from "./surfaces/nodejs/index.js";
import {
  csharpJsSurfaceExtensionId,
  csharpNodejsSurfaceExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import {
  tsonicCoreSourceExtensionId,
} from "@tsonic/source-core";
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
  recordCsharpJsCollectionRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/collections.js";
import {
  recordCsharpJsSurfaceIterationFactsBeforeFinalization,
} from "./surfaces/js/iteration.js";

type CsharpSurfaceLifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export function createCsharpJsSurfaceExtension(context: TargetSurfaceExtensionContext): CompilerExtension {
  const hosts = getCsharpExtensionSemanticHosts(context);
  return {
    identity: {
      id: csharpJsSurfaceExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.surface.js",
    },
    composition: {
      kind: "surface",
      target: csharpTargetId,
      surface: "js",
    },
    dependencies: {
      dependsOn: [tsonicCoreSourceExtensionId],
    },
    initialize(extensionContext): void {
      extensionContext.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpJsSurfaceSeedFactsBeforeFinalization(lifecycleContext, hosts);
        recordCsharpJsSurfaceOperationFactsBeforeFinalization(lifecycleContext, hosts);
      });
    },
  };
}

export function createCsharpNodejsSurfaceExtension(context: TargetSurfaceExtensionContext): CompilerExtension {
  return {
    identity: {
      id: csharpNodejsSurfaceExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.surface.nodejs",
    },
    composition: {
      kind: "surface",
      target: csharpTargetId,
      surface: "nodejs",
    },
    dependencies: {
      dependsOn: [csharpJsSurfaceExtensionId],
    },
    initialize(extensionContext): void {
      void context;
      extensionContext.registerTargetBindingProvider(createCsharpNodejsSurfaceBindingProvider());
    },
  };
}

export function createCsharpJsSurfaceOperationsProvider(hosts: Pick<CsharpExtensionSemanticHosts, "operationsProviderHost">): TargetSemanticProvider {
  const identity = surfaceSemanticProviderIdentity(csharpJsSurfaceExtensionId, "Tsonic C# JavaScript surface semantic mapper");
  const mapper = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, hosts.operationsProviderHost));
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      return mapper.mapRuntimeCarrier(request, context);
    },
    mapCheckedCall(request, context) {
      return mapper.mapCheckedCall(request, context);
    },
    mapCheckedPropertyAccess(request, context) {
      return mapper.mapCheckedPropertyAccess(request, context);
    },
    mapCheckedElementAccess(request, context) {
      return mapper.mapCheckedElementAccess(request, context);
    },
    mapCheckedIteration(request, context) {
      return mapper.mapCheckedIteration(request, context);
    },
  };
}

export function createCsharpNodejsSurfaceOperationsProvider(): TargetSemanticProvider {
  const identity = surfaceSemanticProviderIdentity(csharpNodejsSurfaceExtensionId, "Tsonic C# Node.js surface semantic mapper");
  const mapper = createCsharpNodejsSurfaceMappers(csharpNodejsSurfaceExtensionId);
  return {
    identity,
    mapCheckedCall(request, context) {
      return mapper.mapCheckedCall(request, context);
    },
    mapCheckedPropertyAccess(request, context) {
      return mapper.mapCheckedPropertyAccess(request, context);
    },
    mapCheckedElementAccess() {
      return deferObservation;
    },
  };
}

function surfaceSemanticProviderIdentity(id: string, displayName: string): ProviderIdentity {
  return {
    id,
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName,
  };
}

function recordCsharpJsSurfaceSeedFactsBeforeFinalization(
  lifecycleContext: CsharpSurfaceLifecycleContext,
  hosts: CsharpExtensionSemanticHosts,
): void {
  const jsSurfaceHost = createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, hosts.operationsProviderHost);
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpJsCollectionRuntimeCarrierFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpJsArrayCarrierFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
}

function recordCsharpJsSurfaceOperationFactsBeforeFinalization(
  lifecycleContext: CsharpSurfaceLifecycleContext,
  hosts: CsharpExtensionSemanticHosts,
): void {
  const jsSurfaceHost = createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, hosts.operationsProviderHost);
  recordCsharpSourceLibraryPropertyFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpJsArrayElementAccessFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpJsArrayMutationFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpSourceLibraryCallFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpJsSurfaceIterationFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
}
