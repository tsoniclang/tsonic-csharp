import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  CompilerExtension,
  ExtensionLifecycleContext,
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
  csharpJsSurfaceExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import {
  tsonicCoreSourceExtensionId,
} from "@tsonic/source-core";
import {
  recordCsharpJsArrayCarrierFactsBeforeFinalization,
} from "./surfaces/js/array-carrier-lifecycle.js";
import {
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/regexp/index.js";
import {
  recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/date/index.js";
import {
  recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/json.js";
import {
  checkedCallObservationAsSelection,
  checkedOperationObservationAsSelection,
} from "./target-selection-contract.js";

type CsharpSurfaceLifecycleContext = {
  readonly host: ExtensionLifecycleContext["host"];
  readonly compiler: ExtensionLifecycleContext["compiler"];
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
    initialize(): void {
      void hosts;
    },
  };
}

export function createCsharpJsSurfaceOperationsProvider(hosts: Pick<CsharpExtensionSemanticHosts, "operationsProviderHost">): TargetSemanticProvider {
  const identity = surfaceSemanticProviderIdentity(csharpJsSurfaceExtensionId, "Tsonic C# JavaScript surface semantic mapper");
  const mapper = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, hosts.operationsProviderHost));
  return {
    identity,
    mapCheckedCall(request, context) {
      return checkedCallObservationAsSelection(mapper.mapCheckedCall(request, context));
    },
    mapCheckedPropertyAccess(request, context) {
      return checkedOperationObservationAsSelection(mapper.mapCheckedPropertyAccess(request, context));
    },
    mapCheckedElementAccess(request, context) {
      return checkedOperationObservationAsSelection(mapper.mapCheckedElementAccess(request, context));
    },
    mapCheckedOperator(request, context) {
      return checkedOperationObservationAsSelection(mapper.mapCheckedOperator(request, context));
    },
    mapCheckedIteration(request, context) {
      return checkedOperationObservationAsSelection(mapper.mapCheckedIteration(request, context));
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

export function recordCsharpJsSurfaceSeedFactsBeforeFinalization(
  lifecycleContext: CsharpSurfaceLifecycleContext,
  hosts: CsharpExtensionSemanticHosts,
): void {
  const jsSurfaceHost = createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, hosts.operationsProviderHost);
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization(lifecycleContext, jsSurfaceHost);
  recordCsharpJsArrayCarrierFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
}
