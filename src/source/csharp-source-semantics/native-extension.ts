import {
  ExtensionLifecycleEvent,
} from "@tsonic/tsts";
import type {
  BeforeSemanticsFinalizedLifecycleRequest,
  CompilerExtension,
  SourceFileBoundLifecycleRequest,
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
  createCsharpTargetOperationsProvider,
} from "./operations-provider.js";
import {
  recordCsharpObjectShapeFactsBeforeFinalization,
  recordCsharpTypeParameterConstraintFactsBeforeFinalization,
} from "./object-shape-facts.js";
import {
  recordCsharpObjectRestBindingFactsBeforeFinalization,
} from "./object-shape-lifecycle.js";
import {
  validateCsharpObservedAssignabilityFactsBeforeFinalization,
} from "./checked-assignability-validation/index.js";
import {
  diagnoseSourceCompatRuntimeHardRejectsBeforeFinalization,
  diagnoseOpaqueAnyOperationsBeforeFinalization,
} from "./opaque-any-diagnostics.js";
import {
  recordCsharpTargetNameFactsBeforeFinalization,
} from "./target-name-facts.js";
import {
  recordCsharpSourceDeclarationFactsBeforeFinalization,
} from "./source-declaration-facts.js";
import {
  recordCsharpAttributeApplicationFactsBeforeFinalization,
} from "./attribute-application-facts.js";
import {
  getCsharpExtensionSemanticHosts,
} from "./semantic-hosts.js";
import {
  recordCsharpJsSurfaceSeedFactsBeforeFinalization,
} from "./surface-extensions.js";
import {
  recordCsharpSourceProfileDeclarationFacts,
} from "./source-profile-facts.js";

export function createCsharpTargetSemanticsExtension(context: TargetProviderContext): CompilerExtension {
  const hosts = getCsharpExtensionSemanticHosts(context);
  const jsSurfaceSelected = context.selectedSurfaces.some((surface) => surface.id === "js");
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
      for (const dotnetProvider of hosts.dotnetProviders) {
        extensionContext.registerTargetBindingProvider(createDotnetTargetBindingProvider({
          provider: dotnetProvider.provider,
          moduleSpecifierPolicy: dotnetProvider.moduleSpecifierPolicy,
          references: dotnetProvider.references,
          targetFramework: dotnetProvider.targetFramework,
        }));
      }
      extensionContext.registerTargetSemanticProvider(createCsharpTargetOperationsProvider(hosts.operationsProviderHost, {
        jsSurface: jsSurfaceSelected,
        providerOperationContributions: hosts.providerOperationContributions,
        typescriptCompatibilityMode: hosts.typescriptCompatibilityMode,
      }));
      extensionContext.registerLifecycleHook<SourceFileBoundLifecycleRequest>(ExtensionLifecycleEvent.afterSourceFileBound, (request, lifecycleContext) => {
        recordCsharpSourceProfileDeclarationFacts(request, lifecycleContext.compiler.ast, lifecycleContext.host.facts);
      });
      extensionContext.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        runBeforeFinalizedStage("target-name-facts", () => recordCsharpTargetNameFactsBeforeFinalization(lifecycleContext));
        runBeforeFinalizedStage("source-declaration-facts", () => recordCsharpSourceDeclarationFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost));
        runBeforeFinalizedStage("attribute-application-facts", () => recordCsharpAttributeApplicationFactsBeforeFinalization(lifecycleContext));
        runBeforeFinalizedStage("source-compat-runtime-hard-rejects", () => diagnoseSourceCompatRuntimeHardRejectsBeforeFinalization(lifecycleContext));
        if (jsSurfaceSelected) {
          runBeforeFinalizedStage("js-surface-seed-facts", () => recordCsharpJsSurfaceSeedFactsBeforeFinalization(lifecycleContext, hosts));
        }
        runBeforeFinalizedStage("object-shape-facts", () => recordCsharpObjectShapeFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost));
        runBeforeFinalizedStage("type-parameter-constraint-facts", () => recordCsharpTypeParameterConstraintFactsBeforeFinalization(lifecycleContext, hosts.objectShapeSemanticsHost));
        runBeforeFinalizedStage("object-rest-binding-facts", () => recordCsharpObjectRestBindingFactsBeforeFinalization(lifecycleContext, hosts.objectShapeLifecycleHost));
        runBeforeFinalizedStage("opaque-any-diagnostics", () => diagnoseOpaqueAnyOperationsBeforeFinalization(lifecycleContext, hosts.typescriptCompatibilityMode));
        runBeforeFinalizedStage("observed-assignability-validation", () => validateCsharpObservedAssignabilityFactsBeforeFinalization(lifecycleContext, hosts.operationsProviderHost, hosts.typescriptCompatibilityMode));
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
    const cause = error instanceof Error ? error : undefined;
    if (cause !== undefined && wrapped.stack !== undefined) {
      wrapped.stack = `${wrapped.message}\nCaused by: ${cause.stack ?? cause.message}\nStage wrapper stack:\n${wrapped.stack}`;
    }
    Object.assign(wrapped, {
      stage,
      diagnosticMessage: wrapped.message,
      ...(cause === undefined ? {} : {
        causeMessage: cause.message,
        causeStack: cause.stack,
      }),
    });
    throw wrapped;
  }
}
