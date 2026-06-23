import {
  ExtensionLifecycleEvent,
  ExtensionObservationPoint,
} from "@tsonic/tsts";
import type {
  BeforeSemanticsFinalizedLifecycleRequest,
  CompilerExtension,
  ExtensionHost,
  TargetSemanticProvider,
} from "@tsonic/tsts";
import type {
  TargetSurfaceExtensionContext,
} from "@tsonic/target-api";
import {
  createCsharpJsSurfaceHost,
  createCsharpJsSurfaceOperationsProvider,
  createCsharpNodejsSurfaceOperationsProvider,
  csharpJsSurfaceOperationsProviderId,
} from "./operations-provider.js";
import {
  csharpTargetSemanticsExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import {
  createCsharpExtensionSemanticHosts,
} from "./semantic-hosts.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./surfaces/nodejs/index.js";
import {
  recordCsharpNodejsNamespacePropertyFactsBeforeFinalization,
} from "./surfaces/nodejs/property-lifecycle.js";
import {
  recordCsharpJsArrayElementAccessFactsBeforeFinalization,
} from "./surfaces/js/arrays.js";
import {
  recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization,
} from "./surfaces/js/dictionary-lifecycle.js";
import {
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/regexp.js";

export function createCsharpJsSurfaceExtension(context: TargetSurfaceExtensionContext): CompilerExtension {
  const hosts = createCsharpExtensionSemanticHosts(context);
  return {
    identity: {
      id: "tsonic.csharp.surface.js",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.surface.js",
    },
    dependencies: {
      dependsOn: [csharpTargetSemanticsExtensionId],
    },
    composition: {
      kind: "target",
      target: csharpTargetId,
    },
    initialize(extensionContext): void {
      const jsSurfaceHost = createCsharpJsSurfaceHost(csharpJsSurfaceOperationsProviderId, hosts.operationsProviderHost);
      registerCsharpSurfaceOperationHooks(
        extensionContext.host,
        createCsharpJsSurfaceOperationsProvider(hosts.operationsProviderHost),
      );
      extensionContext.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpJsArrayElementAccessFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
        recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
        recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
      });
    },
  };
}

export function createCsharpNodejsSurfaceExtension(_context: TargetSurfaceExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.surface.nodejs",
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.surface.nodejs",
    },
    dependencies: {
      dependsOn: [csharpTargetSemanticsExtensionId],
    },
    composition: {
      kind: "target",
      target: csharpTargetId,
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpNodejsSurfaceBindingProvider());
      registerCsharpSurfaceOperationHooks(
        context.host,
        createCsharpNodejsSurfaceOperationsProvider(),
      );
      context.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpNodejsNamespacePropertyFactsBeforeFinalization(lifecycleContext);
      });
    },
  };
}

function registerCsharpSurfaceOperationHooks(
  host: ExtensionHost,
  provider: TargetSemanticProvider,
): void {
  if (provider.resolveRuntimeCarrier !== undefined) {
    host.registerObservation(ExtensionObservationPoint.resolveRuntimeCarrier, csharpTargetSemanticsExtensionId, provider.resolveRuntimeCarrier);
  }
  if (provider.mapCheckedCall !== undefined) {
    host.registerObservation(ExtensionObservationPoint.mapCheckedCall, csharpTargetSemanticsExtensionId, provider.mapCheckedCall);
  }
  if (provider.mapCheckedPropertyAccess !== undefined) {
    host.registerObservation(ExtensionObservationPoint.mapCheckedPropertyAccess, csharpTargetSemanticsExtensionId, provider.mapCheckedPropertyAccess);
  }
  if (provider.mapCheckedElementAccess !== undefined) {
    host.registerObservation(ExtensionObservationPoint.mapCheckedElementAccess, csharpTargetSemanticsExtensionId, provider.mapCheckedElementAccess);
  }
  if (provider.mapCheckedIteration !== undefined) {
    host.registerObservation(ExtensionObservationPoint.mapCheckedIteration, csharpTargetSemanticsExtensionId, provider.mapCheckedIteration);
  }
}
