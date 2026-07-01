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
  csharpSourceSemanticsExtensionId,
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
} from "./checked-assignability-validation/index.js";
import {
  validateCsharpTargetConstraintFactsBeforeFinalization,
} from "./target-constraint-validation.js";
import {
  diagnoseSourceCompatRuntimeHardRejectsBeforeFinalization,
  diagnoseOpaqueAnyOperationsBeforeFinalization,
} from "./opaque-any-diagnostics.js";
import {
  recordCsharpTargetNameFactsBeforeFinalization,
} from "./target-name-facts.js";
import {
  recordCsharpProviderTargetBindingFactsBeforeFinalization,
} from "./provider-target-binding-facts.js";
import {
  recordCsharpSourceDeclarationFactsBeforeFinalization,
} from "./source-declaration-facts.js";
import {
  recordCsharpAttributeApplicationFactsBeforeFinalization,
} from "./attribute-application-facts.js";
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
      dependsOn: [tsonicCoreSourceExtensionId, csharpSourceSemanticsExtensionId],
      runsAfter: [tsonicCoreSourceExtensionId, csharpSourceSemanticsExtensionId],
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
        runBeforeFinalizedStage("target-name-facts", () => recordCsharpTargetNameFactsBeforeFinalization(lifecycleContext));
        runBeforeFinalizedStage("provider-target-binding-facts", () => recordCsharpProviderTargetBindingFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost));
        runBeforeFinalizedStage("source-declaration-facts", () => recordCsharpSourceDeclarationFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost));
        runBeforeFinalizedStage("attribute-application-facts", () => recordCsharpAttributeApplicationFactsBeforeFinalization(lifecycleContext));
        runBeforeFinalizedStage("source-compat-runtime-hard-rejects", () => diagnoseSourceCompatRuntimeHardRejectsBeforeFinalization(lifecycleContext));
        if (jsSurfaceSelected) {
          runBeforeFinalizedStage("js-surface-seed-facts", () => recordCsharpJsSurfaceSeedFactsBeforeFinalization(lifecycleContext, hosts));
        }
        runBeforeFinalizedStage("runtime-carrier-facts-initial", () => recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost));
        runBeforeFinalizedStage("assertion-conversion-facts", () => recordCsharpAssertionConversionFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost));
        runBeforeFinalizedStage("object-shape-facts", () => recordCsharpObjectShapeFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost));
        runBeforeFinalizedStage("type-parameter-constraint-facts", () => recordCsharpTypeParameterConstraintFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost));
        runBeforeFinalizedStage("runtime-carrier-facts-after-shapes", () => recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost));
        runBeforeFinalizedStage("object-rest-binding-facts", () => recordCsharpObjectRestBindingFactsBeforeFinalization(lifecycleContext, hosts.objectShapeLifecycleHost));
        runBeforeFinalizedStage("object-shape-property-access-facts", () => recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(lifecycleContext, hosts.objectShapeLifecycleHost));
        runBeforeFinalizedStage("checked-operator-facts", () => recordCsharpCheckedOperatorFactsBeforeFinalization(lifecycleContext, hosts.checkedOperatorLifecycleHost));
        runBeforeFinalizedStage("native-array-facts", () => recordCsharpNativeArrayFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost));
        runBeforeFinalizedStage("target-constraint-validation", () => validateCsharpTargetConstraintFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost));
        if (jsSurfaceSelected) {
          runBeforeFinalizedStage("js-surface-operation-facts-suppress", () => recordCsharpJsSurfaceOperationFactsBeforeFinalization(lifecycleContext, hosts, { diagnostics: "suppress" }));
          runBeforeFinalizedStage("runtime-carrier-facts-after-js-surface", () => recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost));
          runBeforeFinalizedStage("js-surface-operation-facts-append", () => recordCsharpJsSurfaceOperationFactsBeforeFinalization(lifecycleContext, hosts, { diagnostics: "append" }));
          runBeforeFinalizedStage("runtime-carrier-facts-after-js-operations", () => recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, hosts.runtimeCarrierHost));
        }
        runBeforeFinalizedStage("selected-call-operation-facts", () => recordCsharpSelectedCallOperationFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost));
        runBeforeFinalizedStage("opaque-any-diagnostics", () => diagnoseOpaqueAnyOperationsBeforeFinalization(lifecycleContext, hosts.typescriptCompatibilityMode));
        runBeforeFinalizedStage("observed-assignability-validation", () => validateCsharpObservedAssignabilityFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost));
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

function runBeforeFinalizedStage(stage: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    const wrapped = new Error(`C# semantics.beforeFinalized stage '${stage}' failed.`);
    (wrapped as { cause?: unknown }).cause = error;
    Object.assign(wrapped, {
      stage,
      diagnosticMessage: wrapped.message,
    });
    throw wrapped;
  }
}
