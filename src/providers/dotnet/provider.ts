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
import {
  validateDotnetProviderDeclarationModelContract,
} from "./model-contract.js";
import type {
  DotnetModuleModel,
  DotnetProviderIdentity,
  DotnetUnsupportedExportDeclaration,
} from "./model.js";
import {
  augmentDotnetModuleWithNativeArray,
} from "./native-array.js";
import {
  dotnetPackageName,
} from "./module-specifier.js";
import {
  dotnetExtensionDiagnostic,
  dotnetProviderDeclarationModelInvalidDiagnostic,
  dotnetProviderDiagnosticToExtensionDiagnostic,
  dotnetProviderRequestedExportMissingDiagnostic,
  dotnetProviderRequestedExportUnsupportedDiagnostic,
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
  readonly assemblyName?: string;
  readonly externAlias?: string;
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

interface DotnetProviderModuleResolution extends ProviderModuleResolution {
  readonly broadImport?: true;
  readonly requestedExports?: readonly string[];
}

export function createDotnetTargetBindingProvider(options: DotnetBindingProviderOptions): TargetBindingProvider {
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
      const module = dotnetProviderModuleRequest(specifier);
      if (module === undefined) {
        return { kind: "unowned" };
      }
      return mapDotnetOwnership(identity.id, options.provider.ownsModule(module.moduleSpecifier, providerContext(dotnetProviderModuleContext(context, module) ?? { broadImport: true }, options, context.containingFile, module)));
    },
    resolveModule(specifier: string, context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = dotnetProviderModuleRequest(specifier);
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${specifier}'.`);
      }
      const resolutionContext = dotnetProviderModuleContext(context, module);
      if (resolutionContext === undefined) {
        return dotnetProviderRequestSliceRequiredDiagnostic(identity.id, specifier);
      }
      const ownership = options.provider.ownsModule(module.moduleSpecifier, providerContext(resolutionContext, options, context.containingFile, module));
      if (ownership.kind === "rejected") {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, ownership.diagnostic);
      }
      if (ownership.kind !== "owned") {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_UNOWNED", 9200002, `.NET provider does not own '${specifier}'.`);
      }
      const virtualFileName = providerVirtualDeclarationFileName(identity.id, specifier);
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName,
        providerModuleId: module.moduleSpecifier,
        ...(resolutionContext.broadImport === true ? { broadImport: true as const } : {}),
        ...(resolutionContext.requestedExports !== undefined ? { requestedExports: resolutionContext.requestedExports } : {}),
        ...(module.internal === true ? {} : { packageName: dotnetPackageName }),
        evidence: [{ message: ".NET native pass-through provider supplied virtual module." }],
      };
    },
    getDeclarationModel(resolution) {
      const module = dotnetProviderModuleRequest(resolution.moduleSpecifier);
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${resolution.moduleSpecifier}'.`);
      }
      const resolutionContext = dotnetProviderResolutionContextFromResolution(resolution);
      if (resolutionContext === undefined) {
        return dotnetProviderRequestSliceRequiredDiagnostic(identity.id, resolution.moduleSpecifier);
      }
      const result = options.provider.getModule(module.moduleSpecifier, providerContext(resolutionContext, options, resolution.virtualFileName, module));
      if (isDotnetProviderDiagnostic(result)) {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, result);
      }
      const augmentedModule = augmentDotnetModuleWithNativeArray(result, {
        ...(resolutionContext.broadImport === true ? { broadImport: true as const } : {}),
        ...(resolutionContext.requestedExports !== undefined ? { requestedExports: resolutionContext.requestedExports } : {}),
      });
      const unsupportedRequestedExports = requestedUnsupportedExports(augmentedModule, resolutionContext.requestedExports);
      if (unsupportedRequestedExports.length > 0) {
        return dotnetProviderRequestedExportUnsupportedDiagnostic(identity.id, module.moduleSpecifier, unsupportedRequestedExports);
      }
      const missingRequestedExports = missingDotnetRequestedExports(augmentedModule, resolutionContext);
      if (missingRequestedExports.length > 0) {
        return dotnetProviderRequestedExportMissingDiagnostic(identity.id, module.moduleSpecifier, missingRequestedExports);
      }
      const startedAt = performance.now();
      const model = buildClosedProviderDeclarationModel(resolution, resolutionContext, augmentedModule, options, identity.id, module.moduleSpecifier);
      if ("extensionId" in model) {
        return model;
      }
      const declarationContractDiagnostic = validateDotnetProviderDeclarationModelContract(model);
      if (declarationContractDiagnostic !== undefined) {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, declarationContractDiagnostic);
      }
      options.provider.recordVirtualDeclarationModel?.(model, performance.now() - startedAt);
      return model;
    },
    getTargetIdentity(symbol) {
      return options.provider.getTargetIdentity?.(symbol);
    },
  };
}

function buildClosedProviderDeclarationModel(
  resolution: ProviderModuleResolution,
  resolutionContext: DotnetProviderResolutionContext,
  initialModule: DotnetModuleModel,
  options: DotnetBindingProviderOptions,
  extensionId: string,
  providerModuleSpecifier: string,
): ProviderDeclarationModel | ExtensionDiagnostic {
  let currentContext = resolutionContext;
  let currentModule = initialModule;
  for (;;) {
    const model = buildProviderDeclarationModel(resolution, currentContext, currentModule, options, extensionId);
    if ("extensionId" in model || currentContext.broadImport === true) {
      return model;
    }
    const missingProviderRefs = missingProviderDeclarationSameModuleRefs(model, currentContext.requestedExports);
    if (missingProviderRefs.length === 0) {
      return model;
    }
    const requestedExports = sortedUnique([
      ...(currentContext.requestedExports ?? []),
      ...missingProviderRefs,
    ]);
    if (currentContext.requestedExports !== undefined && missingProviderRefs.every((exportName) => currentContext.requestedExports?.includes(exportName) === true)) {
      return dotnetProviderRequestedExportMissingDiagnostic(extensionId, providerModuleSpecifier, missingProviderRefs);
    }
    currentContext = { requestedExports };
    const moduleRequest = dotnetProviderModuleRequest(resolution.moduleSpecifier);
    if (moduleRequest === undefined) {
      return dotnetExtensionDiagnostic(extensionId, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${resolution.moduleSpecifier}'.`);
    }
    const resolved = options.provider.getModule(moduleRequest.moduleSpecifier, providerContext(currentContext, options, resolution.virtualFileName, moduleRequest));
    if (isDotnetProviderDiagnostic(resolved)) {
      return dotnetProviderDiagnosticToExtensionDiagnostic(extensionId, resolved);
    }
    const augmentedModule = augmentDotnetModuleWithNativeArray(resolved, currentContext);
    const missingRequestedExports = missingDotnetRequestedExports(augmentedModule, currentContext);
    if (missingRequestedExports.length > 0) {
      return dotnetProviderRequestedExportMissingDiagnostic(extensionId, providerModuleSpecifier, missingRequestedExports);
    }
    currentModule = augmentedModule;
  }
}

function buildProviderDeclarationModel(
  resolution: ProviderModuleResolution,
  resolutionContext: DotnetProviderResolutionContext,
  module: DotnetModuleModel,
  options: DotnetBindingProviderOptions,
  extensionId: string,
): ProviderDeclarationModel | ExtensionDiagnostic {
  const resolvedModule = {
    ...sliceDotnetModuleExports(module, resolutionContext),
    moduleSpecifier: resolution.moduleSpecifier,
  };
  try {
    return dotnetModuleToProviderDeclarationModel(resolvedModule, {
      providerModuleId: resolution.providerModuleId,
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
  } catch (error) {
    return dotnetProviderDeclarationModelInvalidDiagnostic(extensionId, resolution.moduleSpecifier, error);
  }
}

function missingProviderDeclarationSameModuleRefs(
  model: ProviderDeclarationModel,
  requestedExports: readonly string[] | undefined,
): readonly string[] {
  if (requestedExports === undefined) {
    return [];
  }
  const exportedNames = new Set<string>();
  const exportsByName = new Map(model.exports.map((declaration) => [declaration.name, declaration]));
  for (const declaration of model.exports) {
    exportedNames.add(declaration.name);
    const sourceTypeFamily = (declaration as { readonly sourceTypeFamily?: { readonly exportName?: string } }).sourceTypeFamily;
    if (typeof sourceTypeFamily?.exportName === "string") {
      exportedNames.add(sourceTypeFamily.exportName);
    }
  }
  const missing = new Set<string>();
  const pending = [...requestedExports];
  const expanded = new Set<string>();
  while (pending.length > 0) {
    const exportName = pending.pop();
    if (exportName === undefined || expanded.has(exportName)) {
      continue;
    }
    expanded.add(exportName);
    const declaration = exportsByName.get(exportName);
    if (declaration === undefined) {
      continue;
    }
    if (!requestedExports.includes(exportName) && !providerDeclarationExpandsSourceClosure(declaration)) {
      continue;
    }
    for (const dependency of collectProviderDeclarationSameModuleRefs(declaration, model.moduleSpecifier)) {
      if (exportedNames.has(dependency)) {
        pending.push(dependency);
      } else {
        missing.add(dependency);
      }
    }
  }
  return [...missing].sort();
}

function providerDeclarationExpandsSourceClosure(declaration: ProviderDeclarationModel["exports"][number]): boolean {
  return (declaration.members?.length ?? 0) > 0 ||
    (declaration.signatures?.length ?? 0) > 0 ||
    (declaration.heritage?.length ?? 0) > 0;
}

function collectProviderDeclarationSameModuleRefs(
  value: unknown,
  moduleSpecifier: string,
  refs = new Set<string>(),
  visited = new WeakSet<object>(),
): readonly string[] {
  if (value === undefined || value === null || typeof value !== "object") {
    return [...refs].sort();
  }
  if (visited.has(value)) {
    return [...refs].sort();
  }
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collectProviderDeclarationSameModuleRefs(item, moduleSpecifier, refs, visited);
    }
    return [...refs].sort();
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === "provider-ref" && record.moduleSpecifier === moduleSpecifier && typeof record.exportName === "string") {
    refs.add(record.exportName);
  }
  for (const [key, child] of Object.entries(record)) {
    if (nonSourceClosureMetadataKeys.has(key)) {
      continue;
    }
    collectProviderDeclarationSameModuleRefs(child, moduleSpecifier, refs, visited);
  }
  return [...refs].sort();
}

const nonSourceClosureMetadataKeys = new Set([
  "attributes",
  "evidence",
  "targetIdentity",
  "unsupportedAttributes",
]);

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function dotnetProviderResolutionContextFromResolution(
  resolution: ProviderModuleResolution,
): DotnetProviderResolutionContext | undefined {
  const dotnetResolution = resolution as DotnetProviderModuleResolution;
  if (dotnetResolution.broadImport === true) {
    return { broadImport: true };
  }
  if (dotnetResolution.requestedExports !== undefined) {
    return { requestedExports: dotnetResolution.requestedExports };
  }
  return undefined;
}

function requestedUnsupportedExports(
  module: DotnetModuleModel,
  requestedExports: readonly string[] | undefined,
): readonly DotnetUnsupportedExportDeclaration[] {
  if (requestedExports === undefined || requestedExports.length === 0 || module.unsupportedExports === undefined) {
    return [];
  }
  const requested = new Set(requestedExports);
  return module.unsupportedExports.filter((declaration) => requested.has(declaration.sourceName));
}

function providerContext(
  context: DotnetProviderResolutionContext,
  options: DotnetBindingProviderOptions,
  containingFile?: string,
  module?: ReturnType<typeof dotnetProviderModuleRequest>,
): DotnetProviderModuleContext {
  return {
    ...(containingFile !== undefined ? { containingFile } : {}),
    ...(context.broadImport === true ? { broadImport: true as const } : {}),
    ...(context.requestedExports !== undefined ? { requestedExports: context.requestedExports } : {}),
    ...(options.targetFramework !== undefined ? { targetFramework: options.targetFramework } : {}),
    ...(options.references !== undefined ? { references: options.references } : {}),
    ...(module?.assemblyName !== undefined ? { assemblyName: module.assemblyName } : {}),
    ...(module?.externAlias !== undefined ? { externAlias: module.externAlias } : {}),
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
