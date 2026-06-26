import {
  ExtensionLifecycleEvent,
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  BeforeSemanticsFinalizedLifecycleRequest,
  CompilerExtension,
} from "@tsonic/tsts";
import type {
  TargetProviderContext,
} from "@tsonic/target-api";
import {
  createDotnetTargetBindingProvider,
} from "../../providers/dotnet/index.js";
import {
  tsonicCoreSourceExtensionId,
} from "@tsonic/source-core";
import {
  csharpTargetSemanticsExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  asType,
} from "./target-ref-utils.js";
import {
  createCsharpTargetOperationsProvider,
} from "./operations-provider.js";
import {
  recordCsharpRuntimeCarrierFactsBeforeFinalization,
} from "./runtime-carriers.js";
import {
  recordCsharpObjectShapeFactsBeforeFinalization,
  recordCsharpTypeParameterConstraintFactsBeforeFinalization,
} from "./object-shape-facts.js";
import {
  recordCsharpObjectRestBindingFactsBeforeFinalization,
  recordCsharpObjectShapePropertyAccessFactsBeforeFinalization,
} from "./object-shape-lifecycle.js";
import {
  recordCsharpCheckedOperatorFactsBeforeFinalization,
} from "./checked-operator-lifecycle.js";
import {
  recordCsharpNativeArrayFactsBeforeFinalization,
} from "./native-array-lifecycle.js";
import {
  recordCsharpSelectedCallOperationFactsBeforeFinalization,
} from "./csharp-operation-lifecycle.js";
import {
  validateCsharpObservedAssignabilityFactsBeforeFinalization,
} from "./checked-assignability-validation.js";
import {
  diagnoseOpaqueAnyOperationsBeforeFinalization,
} from "./opaque-any-diagnostics.js";
import {
  recordCsharpTargetNameFactsBeforeFinalization,
} from "./target-name-facts.js";
import {
  recordCsharpSourceDeclarationFactsBeforeFinalization,
} from "./source-declaration-facts.js";
import {
  recordCsharpAssertionConversionFactsBeforeFinalization,
} from "./source-assertion-conversions.js";
import {
  getCsharpExtensionSemanticHosts,
} from "./semantic-hosts.js";
import {
  recordCsharpJsSurfaceOperationFactsBeforeFinalization,
  recordCsharpJsSurfaceSeedFactsBeforeFinalization,
} from "./surface-extensions.js";

export function createCsharpTargetSemanticsExtension(context: TargetProviderContext): CompilerExtension {
  const hosts = getCsharpExtensionSemanticHosts(context);
  const jsSurfaceSelected = context.selectedSurfaces.some((surface) => surface.id === "js");
  const nodejsSurfaceSelected = context.selectedSurfaces.some((surface) => surface.id === "nodejs");
  return {
    identity: {
      id: csharpTargetSemanticsExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.target-semantics",
    },
    composition: {
      kind: "target",
      target: csharpTargetId,
    },
    dependencies: {
      dependsOn: [tsonicCoreSourceExtensionId],
      runsAfter: [tsonicCoreSourceExtensionId],
    },
    initialize(extensionContext): void {
      extensionContext.registerTargetBindingProvider(createDotnetTargetBindingProvider({
        provider: hosts.dotnetProvider,
        references: hosts.dotnetReflectionReferences,
        targetFramework: hosts.dotnetTargetFramework,
      }));
      extensionContext.registerTargetSemanticProvider(createCsharpTargetOperationsProvider(hosts.operationsProviderHost, {
        jsSurface: jsSurfaceSelected,
        nodejsSurface: nodejsSurfaceSelected,
      }));
      extensionContext.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpTargetNameFactsBeforeFinalization(lifecycleContext);
        recordCsharpSourceDeclarationFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost);
        if (jsSurfaceSelected) {
          recordCsharpJsSurfaceSeedFactsBeforeFinalization(lifecycleContext, hosts);
        }
        recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost);
        recordCsharpAssertionConversionFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
        recordCsharpObjectShapeFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost);
        recordCsharpTypeParameterConstraintFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost);
        recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost);
        recordCsharpObjectRestBindingFactsBeforeFinalization(lifecycleContext, hosts.objectShapeLifecycleHost);
        recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(lifecycleContext, hosts.objectShapeLifecycleHost);
        recordCsharpCheckedOperatorFactsBeforeFinalization(lifecycleContext, hosts.checkedOperatorLifecycleHost);
        recordCsharpNativeArrayFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
        if (jsSurfaceSelected) {
          recordCsharpJsSurfaceOperationFactsBeforeFinalization(lifecycleContext, hosts, { diagnostics: "suppress" });
          recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost);
          recordCsharpJsSurfaceOperationFactsBeforeFinalization(lifecycleContext, hosts, { diagnostics: "append" });
        }
        recordCsharpSelectedCallOperationFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
        diagnoseOpaqueAnyOperationsBeforeFinalization(lifecycleContext, hosts.typescriptCompatibilityMode);
        validateCsharpObservedAssignabilityFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost);
      });
      extensionContext.factResolver.register(runtimeCarrierFactKey, (subject, resolverContext) => {
        if (asType(subject) !== undefined) {
          return undefined;
        }
        const primitive = resolverContext.facts.get(subject, sourcePrimitiveFactKey);
        return primitive === undefined
          ? undefined
          : {
              value: {
                carrier: csharpSourcePrimitiveTargetType(primitive.kind),
              },
              evidence: [{ message: "C# primitive carrier resolved from finalized source primitive fact." }],
            };
      });
    },
  };
}
