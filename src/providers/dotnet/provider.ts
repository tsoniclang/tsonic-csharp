import {
  performance,
} from "node:perf_hooks";
import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderSymbolIdentity,
  TargetBindingProvider,
  TargetIdentity,
} from "@tsonic/tsts";
import { dotnetModuleToProviderDeclarationModel } from "./declaration-model.js";
import type {
  DotnetModuleModel,
  DotnetProviderIdentity,
} from "./model.js";
import {
  augmentDotnetModuleWithNativeArray,
} from "./native-array.js";
import {
  createDotnetProviderDependencyModuleSpecifier,
  dotnetPackageName,
  parseDotnetProviderDependencyModuleSpecifier,
} from "./module-specifier.js";
import {
  dotnetExtensionDiagnostic,
  dotnetProviderDiagnosticToExtensionDiagnostic,
  dotnetProviderRequestedExportMissingDiagnostic,
  dotnetProviderRequestSliceRequiredDiagnostic,
  isDotnetProviderDiagnostic,
} from "./provider-diagnostics.js";
import {
  dotnetProviderModuleContext,
  dotnetProviderModuleRequest,
  providerVirtualDeclarationFileName,
} from "./provider-request.js";
import {
  missingDotnetRequestedExports,
  sliceDotnetModuleExports,
} from "./provider-slices.js";
import type {
  DotnetProviderResolutionContext,
} from "./provider-slices.js";

export interface DotnetTypeDataProvider {
  readonly identity: DotnetProviderIdentity;
  ownsModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderOwnership;
  getModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult;
  getTargetIdentity?(symbol: ProviderSymbolIdentity): TargetIdentity | undefined;
  recordVirtualDeclarationModel?(model: ProviderDeclarationModel, elapsedMs: number): void;
}

export interface DotnetProviderModuleContext {
  readonly containingFile?: string;
  readonly targetFramework?: string;
  readonly references?: readonly string[];
  readonly requestedExports?: readonly string[];
  readonly requestedTargetIds?: readonly string[];
  readonly requestedMetadataNames?: readonly string[];
  readonly broadImport?: boolean;
}

export type DotnetProviderOwnership =
  | { readonly kind: "owned" }
  | { readonly kind: "unowned" }
  | { readonly kind: "rejected"; readonly diagnostic: DotnetProviderDiagnostic };

export type DotnetProviderModuleResult = DotnetModuleModel | DotnetProviderDiagnostic;

export interface DotnetProviderDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly evidence?: readonly Readonly<Record<string, unknown>>[];
}

export interface DotnetBindingProviderOptions {
  readonly provider: DotnetTypeDataProvider;
  readonly targetFramework?: string;
  readonly references?: readonly string[];
}

export function createDotnetTargetBindingProvider(options: DotnetBindingProviderOptions): TargetBindingProvider {
  const resolutionContextsByVirtualFile = new Map<string, DotnetProviderResolutionContext>();
  const identity: ProviderIdentity = {
    id: options.provider.identity.id,
    version: options.provider.identity.version,
    target: "csharp",
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: options.provider.identity.displayName,
  };
  return {
    identity,
    ownsModule(specifier: string, context: ProviderModuleContext): ProviderOwnership {
      const module = dotnetProviderModuleRequest(specifier, identity.id, context);
      if (module === undefined) {
        return { kind: "unowned" };
      }
      return mapDotnetOwnership(identity.id, options.provider.ownsModule(module.moduleSpecifier, providerContext(dotnetProviderModuleContext(context, module) ?? { broadImport: true }, options, context.containingFile)));
    },
    resolveModule(specifier: string, context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = dotnetProviderModuleRequest(specifier, identity.id, context);
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${specifier}'.`);
      }
      const resolutionContext = dotnetProviderModuleContext(context, module);
      if (resolutionContext === undefined) {
        return dotnetProviderRequestSliceRequiredDiagnostic(identity.id, specifier);
      }
      const ownership = options.provider.ownsModule(module.moduleSpecifier, providerContext(resolutionContext, options, context.containingFile));
      if (ownership.kind === "rejected") {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, ownership.diagnostic);
      }
      if (ownership.kind !== "owned") {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_UNOWNED", 9200002, `.NET provider does not own '${specifier}'.`);
      }
      const virtualFileName = providerVirtualDeclarationFileName(identity.id, specifier, resolutionContext);
      resolutionContextsByVirtualFile.set(virtualFileName, resolutionContext);
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName,
        providerModuleId: module.moduleSpecifier,
        ...(module.internal === true ? {} : { packageName: dotnetPackageName }),
        evidence: [{ message: ".NET native pass-through provider supplied virtual module." }],
      };
    },
    getDeclarationModel(resolution) {
      const module = dotnetProviderModuleRequest(resolution.moduleSpecifier, identity.id, {
        containingFile: resolution.virtualFileName,
      });
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${resolution.moduleSpecifier}'.`);
      }
      const resolutionContext = resolutionContextsByVirtualFile.get(resolution.virtualFileName);
      if (resolutionContext === undefined) {
        return dotnetProviderRequestSliceRequiredDiagnostic(identity.id, resolution.moduleSpecifier);
      }
      const result = options.provider.getModule(module.moduleSpecifier, providerContext(resolutionContext, options, resolution.virtualFileName));
      if (isDotnetProviderDiagnostic(result)) {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, result);
      }
      const augmentedModule = augmentDotnetModuleWithNativeArray(result, {
        ...(resolutionContext.broadImport === true ? { broadImport: true as const } : {}),
        ...(resolutionContext.requestedExports !== undefined ? { requestedExports: resolutionContext.requestedExports } : {}),
      });
      const missingRequestedExports = missingDotnetRequestedExports(augmentedModule, resolutionContext);
      if (missingRequestedExports.length > 0) {
        return dotnetProviderRequestedExportMissingDiagnostic(identity.id, module.moduleSpecifier, missingRequestedExports);
      }
      const startedAt = performance.now();
      const resolvedModule = {
        ...sliceDotnetModuleExports(augmentedModule, resolutionContext),
        moduleSpecifier: resolution.moduleSpecifier,
      };
      const model = dotnetModuleToProviderDeclarationModel(resolvedModule, {
        providerModuleId: resolution.providerModuleId,
        dependencyModuleSpecifier(moduleSpecifier, sourceName) {
          return parseDotnetProviderDependencyModuleSpecifier(moduleSpecifier) === undefined
            ? createDotnetProviderDependencyModuleSpecifier(identity.id, moduleSpecifier, [sourceName])
            : moduleSpecifier;
        },
        resolveModule(specifier, requestedExports) {
          const dependencyResolutionContext = dotnetProviderModuleContext({ containingFile: resolution.virtualFileName }, { moduleSpecifier: specifier, requestedExports });
          if (dependencyResolutionContext === undefined) {
            return undefined;
          }
          const resolved = options.provider.getModule(specifier, providerContext(dependencyResolutionContext, options));
          if (isDotnetProviderDiagnostic(resolved)) {
            return undefined;
          }
          const augmentedDependencyModule = augmentDotnetModuleWithNativeArray(resolved, dependencyResolutionContext);
          return missingDotnetRequestedExports(augmentedDependencyModule, dependencyResolutionContext).length > 0
            ? undefined
            : sliceDotnetModuleExports(augmentedDependencyModule, dependencyResolutionContext);
        },
      });
      options.provider.recordVirtualDeclarationModel?.(model, performance.now() - startedAt);
      return model;
    },
    getTargetIdentity(symbol) {
      return options.provider.getTargetIdentity?.(symbol);
    },
  };
}

function providerContext(
  context: DotnetProviderResolutionContext,
  options: DotnetBindingProviderOptions,
  containingFile?: string,
): DotnetProviderModuleContext {
  return {
    ...(containingFile !== undefined ? { containingFile } : {}),
    ...(context.broadImport === true ? { broadImport: true as const } : {}),
    ...(context.requestedExports !== undefined ? { requestedExports: context.requestedExports } : {}),
    ...(options.targetFramework !== undefined ? { targetFramework: options.targetFramework } : {}),
    ...(options.references !== undefined ? { references: options.references } : {}),
  };
}

function mapDotnetOwnership(extensionId: string, ownership: DotnetProviderOwnership): ProviderOwnership {
  switch (ownership.kind) {
    case "owned":
      return { kind: "owned" };
    case "unowned":
      return { kind: "unowned" };
    case "rejected":
      return {
        kind: "reject",
        diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic(extensionId, ownership.diagnostic),
      };
  }
}
