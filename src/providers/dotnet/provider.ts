import {
  performance,
} from "node:perf_hooks";
import {
  TstsSourceProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationMaterialization,
  ProviderDeclarationModel,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  SourceDeclarationProvider,
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
  dotnetModuleSpecifierPolicy,
} from "./module-specifier.js";
import type {
  DotnetModuleSpecifierPolicy,
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
  dotnetProviderResolutionContext,
  missingDotnetRequestedExports,
  sliceDotnetModuleExports,
} from "./provider-slices.js";
import type {
  DotnetProviderResolutionContext,
} from "./provider-slices.js";

export interface DotnetTypeDataProvider {
  readonly identity: DotnetProviderIdentity;
  ownsModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderOwnership;
  getModule(specifier: string, context: DotnetProviderDeclarationContext): DotnetProviderModuleResult;
  recordVirtualDeclarationModel?(model: ProviderDeclarationModel, elapsedMs: number): void;
}

export interface DotnetProviderModuleContext {
  readonly containingFile?: string;
  readonly targetFramework?: string;
  readonly requestedExports?: readonly string[];
  readonly requestedTargetIds?: readonly string[];
  readonly requestedMetadataNames?: readonly string[];
  readonly assemblyName?: string;
  readonly externAlias?: string;
  readonly broadImport?: boolean;
}

export interface DotnetProviderDeclarationContext extends DotnetProviderModuleContext {
  readonly materialization: ProviderDeclarationMaterialization;
}

export const completeDotnetProviderMaterialization = Object.freeze({
  kind: "complete",
} satisfies ProviderDeclarationMaterialization);

export const emptyIncrementalDotnetProviderMaterialization = Object.freeze({
  kind: "incremental",
  completeExports: Object.freeze([]),
} satisfies ProviderDeclarationMaterialization);

export function completeDotnetProviderContext(
  context: DotnetProviderModuleContext = {},
): DotnetProviderDeclarationContext {
  return Object.freeze({
    ...context,
    materialization: completeDotnetProviderMaterialization,
  });
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
  readonly moduleSpecifierPolicy?: DotnetModuleSpecifierPolicy;
  readonly targetFramework?: string;
}

export function createDotnetSourceDeclarationProvider(options: DotnetBindingProviderOptions): SourceDeclarationProvider {
  return createDotnetSourceDeclarationProviderWithDependencies(
    options,
    resolveDotnetDependencyModuleFrom([options]),
  );
}

export function createDotnetSourceDeclarationProviderSet(
  registrations: readonly DotnetBindingProviderOptions[],
): readonly SourceDeclarationProvider[] {
  validateDotnetProviderRegistrations(registrations);
  const resolveDependencyModule = resolveDotnetDependencyModuleFrom(registrations);
  return Object.freeze(registrations.map((registration) =>
    createDotnetSourceDeclarationProviderWithDependencies(
      registration,
      resolveDependencyModule,
    )));
}

type ResolveDotnetDependencyModule = (
  specifier: string,
  requestedExports: readonly string[],
  containingFile: string,
  materialization: ProviderDeclarationMaterialization,
) => DotnetModuleModel | undefined;

function createDotnetSourceDeclarationProviderWithDependencies(
  options: DotnetBindingProviderOptions,
  resolveDependencyModule: ResolveDotnetDependencyModule,
): SourceDeclarationProvider {
  const moduleSpecifierPolicy = options.moduleSpecifierPolicy ?? dotnetModuleSpecifierPolicy;
  const identity: ProviderIdentity = {
    id: options.provider.identity.id,
    version: options.provider.identity.version,
    extensionContractVersion: TstsSourceProviderContractVersion,
    displayName: options.provider.identity.displayName,
  };
  return {
    identity,
    declarationMaterialization: "incremental",
    ownsModule(specifier: string, context: ProviderModuleContext): ProviderOwnership {
      const module = dotnetProviderModuleRequest(specifier, moduleSpecifierPolicy);
      if (module === undefined) {
        return { kind: "unowned" };
      }
      return mapDotnetOwnership(identity.id, options.provider.ownsModule(module.moduleSpecifier, providerModuleContext(dotnetProviderModuleContext(context, module) ?? { broadImport: true }, options, context.containingFile, module)));
    },
    resolveModule(specifier: string, context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = dotnetProviderModuleRequest(specifier, moduleSpecifierPolicy);
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${specifier}'.`);
      }
      const resolutionContext = dotnetProviderModuleContext(context, module);
      if (resolutionContext === undefined) {
        return dotnetProviderRequestSliceRequiredDiagnostic(identity.id, specifier);
      }
      const ownership = options.provider.ownsModule(module.moduleSpecifier, providerModuleContext(resolutionContext, options, context.containingFile, module));
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
        ...(module.internal === true ? {} : { packageName: moduleSpecifierPolicy.packageName }),
        evidence: [{ message: ".NET native pass-through provider supplied virtual module." }],
      };
    },
    getDeclarationModel(resolution, request) {
      const resolutionContext = dotnetProviderResolutionContext(request.context);
      if (resolutionContext === undefined) {
        return dotnetProviderRequestSliceRequiredDiagnostic(identity.id, resolution.moduleSpecifier);
      }
      return resolveDotnetProviderDeclarationProjection(
        options,
        identity.id,
        resolution,
        resolutionContext,
        request.materialization,
        moduleSpecifierPolicy,
        resolveDependencyModule,
      );
    },
  };
}

export function resolveDotnetProviderDeclarationProjection(
  options: DotnetBindingProviderOptions,
  extensionId: string,
  resolution: ProviderModuleResolution,
  resolutionContext: DotnetProviderResolutionContext,
  materialization: ProviderDeclarationMaterialization,
  moduleSpecifierPolicy: DotnetModuleSpecifierPolicy = options.moduleSpecifierPolicy ?? dotnetModuleSpecifierPolicy,
  resolveDependencyModule: ResolveDotnetDependencyModule = resolveDotnetDependencyModuleFrom([options]),
): ProviderDeclarationModel | ExtensionDiagnostic {
  const module = dotnetProviderModuleRequest(resolution.moduleSpecifier, moduleSpecifierPolicy);
  if (module === undefined || module.moduleSpecifier !== resolution.providerModuleId) {
    return dotnetExtensionDiagnostic(
      extensionId,
      "DOTNET_MODULE_SPECIFIER_INVALID",
      9200001,
      `.NET provider resolution for '${resolution.moduleSpecifier}' does not match provider module '${resolution.providerModuleId}'.`,
    );
  }
  const effectiveResolutionContext = resolutionContextWithMaterialization(
    resolutionContext,
    materialization,
  );
  const result = options.provider.getModule(
    resolution.providerModuleId,
    providerDeclarationContext(
      effectiveResolutionContext,
      materialization,
      options,
      resolution.virtualFileName,
      module,
    ),
  );
  if (isDotnetProviderDiagnostic(result)) {
    return dotnetProviderDiagnosticToExtensionDiagnostic(extensionId, result);
  }
  const augmentedModule = augmentDotnetModuleWithNativeArray(result, {
    materialization,
    ...(effectiveResolutionContext.broadImport === true ? { broadImport: true as const } : {}),
    ...(effectiveResolutionContext.requestedExports !== undefined
      ? { requestedExports: effectiveResolutionContext.requestedExports }
      : {}),
  });
  const unsupportedRequestedExports = requestedUnsupportedExports(
    augmentedModule,
    effectiveResolutionContext.requestedExports,
  );
  if (unsupportedRequestedExports.length > 0) {
    return dotnetProviderRequestedExportUnsupportedDiagnostic(
      extensionId,
      resolution.providerModuleId,
      unsupportedRequestedExports,
    );
  }
  const missingRequestedExports = missingDotnetRequestedExports(
    augmentedModule,
    effectiveResolutionContext,
  );
  if (missingRequestedExports.length > 0) {
    return dotnetProviderRequestedExportMissingDiagnostic(
      extensionId,
      resolution.providerModuleId,
      missingRequestedExports,
    );
  }
  const startedAt = performance.now();
  const model = buildProviderDeclarationModel(
    resolution,
    effectiveResolutionContext,
    augmentedModule,
    extensionId,
    resolveDependencyModule,
  );
  if ("extensionId" in model) {
    return model;
  }
  const declarationContractDiagnostic = validateDotnetProviderDeclarationModelContract(model);
  if (declarationContractDiagnostic !== undefined) {
    return dotnetProviderDiagnosticToExtensionDiagnostic(extensionId, declarationContractDiagnostic);
  }
  options.provider.recordVirtualDeclarationModel?.(model, performance.now() - startedAt);
  return model;
}

function buildProviderDeclarationModel(
  resolution: ProviderModuleResolution,
  resolutionContext: DotnetProviderResolutionContext,
  module: DotnetModuleModel,
  extensionId: string,
  resolveDependencyModule: ResolveDotnetDependencyModule,
): ProviderDeclarationModel | ExtensionDiagnostic {
  const resolvedModule = {
    ...sliceDotnetModuleExports(module, resolutionContext),
    moduleSpecifier: resolution.moduleSpecifier,
  };
  try {
    return dotnetModuleToProviderDeclarationModel(resolvedModule, {
      providerModuleId: resolution.providerModuleId,
      resolveModule(specifier, requestedExports, materialization) {
        return resolveDependencyModule(
          specifier,
          requestedExports,
          resolution.virtualFileName,
          materialization,
        );
      },
    });
  } catch (error) {
    return dotnetProviderDeclarationModelInvalidDiagnostic(extensionId, resolution.moduleSpecifier, error);
  }
}

function resolveDotnetDependencyModuleFrom(
  registrations: readonly DotnetBindingProviderOptions[],
): ResolveDotnetDependencyModule {
  return (specifier, requestedExports, containingFile, materialization) => {
    const matches = registrations
      .map((registration) => ({
        registration,
        moduleSpecifierPolicy:
          registration.moduleSpecifierPolicy ?? dotnetModuleSpecifierPolicy,
      }))
      .map((entry) => ({
        ...entry,
        module: dotnetProviderModuleRequest(specifier, entry.moduleSpecifierPolicy),
      }))
      .filter((entry): entry is typeof entry & {
        readonly module: NonNullable<typeof entry.module>;
      } => entry.module !== undefined);
    if (matches.length === 0) {
      return undefined;
    }
    if (matches.length !== 1) {
      throw new Error(
        `.NET provider dependency module '${specifier}' has ${matches.length} registered owners.`,
      );
    }
    const { registration, module } = matches[0]!;
    const resolutionContext: DotnetProviderResolutionContext = {
      requestedExports,
    };
    const context = providerModuleContext(
      resolutionContext,
      registration,
      containingFile,
      module,
    );
    const ownership = registration.provider.ownsModule(
      module.moduleSpecifier,
      context,
    );
    if (ownership.kind !== "owned") {
      if (ownership.kind === "rejected") {
        throw new Error(
          `.NET provider '${registration.provider.identity.id}' rejected dependency module '${specifier}': ${ownership.diagnostic.message}`,
        );
      }
      return undefined;
    }
    const resolved = registration.provider.getModule(
      module.moduleSpecifier,
      {
        ...context,
        materialization,
      },
    );
    if (isDotnetProviderDiagnostic(resolved)) {
      throw new Error(
        `.NET provider '${registration.provider.identity.id}' rejected dependency module '${specifier}': ${resolved.message}`,
      );
    }
    const augmented = augmentDotnetModuleWithNativeArray(
      resolved,
      {
        ...resolutionContext,
        materialization,
      },
    );
    return missingDotnetRequestedExports(augmented, resolutionContext).length > 0
      ? undefined
      : sliceDotnetModuleExports(augmented, resolutionContext);
  };
}

function validateDotnetProviderRegistrations(
  registrations: readonly DotnetBindingProviderOptions[],
): void {
  const identities = new Set<string>();
  const prefixes = new Set<string>();
  for (const registration of registrations) {
    const identity = JSON.stringify([
      registration.provider.identity.id,
      registration.provider.identity.version,
    ]);
    if (!identities.add(identity)) {
      throw new Error(
        `.NET source provider registration duplicates '${registration.provider.identity.id}@${registration.provider.identity.version}'.`,
      );
    }
    const prefix = (registration.moduleSpecifierPolicy ?? dotnetModuleSpecifierPolicy).modulePrefix;
    if (!prefixes.add(prefix)) {
      throw new Error(
        `.NET source provider registration duplicates module prefix '${prefix}'.`,
      );
    }
  }
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function resolutionContextWithMaterialization(
  context: DotnetProviderResolutionContext,
  materialization: ProviderDeclarationMaterialization,
): DotnetProviderResolutionContext {
  if (context.broadImport === true || materialization.kind === "complete") {
    return context;
  }
  const requestedExports = sortedUnique([
    ...(context.requestedExports ?? []),
    ...materialization.completeExports.map((request) => request.exportName),
  ]);
  return requestedExports.length === 0
    ? context
    : { requestedExports };
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

function providerModuleContext(
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
    ...(module?.assemblyName !== undefined ? { assemblyName: module.assemblyName } : {}),
    ...(module?.externAlias !== undefined ? { externAlias: module.externAlias } : {}),
  };
}

function providerDeclarationContext(
  context: DotnetProviderResolutionContext,
  materialization: ProviderDeclarationMaterialization,
  options: DotnetBindingProviderOptions,
  containingFile?: string,
  module?: ReturnType<typeof dotnetProviderModuleRequest>,
): DotnetProviderDeclarationContext {
  return {
    ...providerModuleContext(context, options, containingFile, module),
    materialization,
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
