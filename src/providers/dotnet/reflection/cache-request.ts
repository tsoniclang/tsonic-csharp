import type {
  DotnetProviderModuleContext,
  DotnetProviderDiagnostic,
} from "../provider.js";
import type {
  DotnetProviderCacheRequest,
} from "./cache.js";
import type {
  DotnetProviderToolIdentity,
} from "./tool.js";
import {
  referenceIdentities,
} from "./tool.js";
import {
  diagnostic,
} from "./diagnostics.js";
import {
  dotnetReflectionProviderCacheAbiVersion,
  dotnetReflectionProviderIdentity,
  dotnetReflectionSupportedTargetFramework,
} from "./provider-identity.js";

export interface DotnetReflectionCacheRequestOptions {
  readonly referenceDirectory?: string;
  readonly references?: readonly string[];
  readonly targetFramework?: string;
}

export interface CreateDotnetReflectionCacheRequestInput {
  readonly specifier: string;
  readonly namespaceName: string;
  readonly context: DotnetProviderModuleContext;
  readonly options: DotnetReflectionCacheRequestOptions;
  readonly toolIdentity: DotnetProviderToolIdentity;
}

export function createDotnetReflectionCacheRequest(
  input: CreateDotnetReflectionCacheRequestInput,
): DotnetProviderCacheRequest {
  return {
    providerId: dotnetReflectionProviderIdentity.id,
    providerVersion: dotnetReflectionProviderIdentity.version,
    providerCacheAbiVersion: dotnetReflectionProviderCacheAbiVersion,
    targetFramework: input.context.targetFramework ?? input.options.targetFramework ?? dotnetReflectionSupportedTargetFramework,
    moduleSpecifier: input.specifier,
    namespaceName: input.namespaceName,
    requestedExports: sortedNonEmpty(input.context.requestedExports),
    requestedTargetIds: sortedNonEmpty(input.context.requestedTargetIds),
    requestedMetadataNames: sortedNonEmpty(input.context.requestedMetadataNames),
    broadImport: input.context.broadImport,
    assemblyName: input.context.assemblyName,
    referenceDirectory: input.options.referenceDirectory,
    referenceIdentities: referenceIdentities([...(input.context.references ?? []), ...(input.options.references ?? [])]),
    toolIdentity: input.toolIdentity,
  };
}

export function validateDotnetReflectionTargetFramework(
  context: DotnetProviderModuleContext,
  options: DotnetReflectionCacheRequestOptions,
): DotnetProviderDiagnostic | undefined {
  const targetFramework = context.targetFramework ?? options.targetFramework;
  if (targetFramework === undefined || targetFramework === dotnetReflectionSupportedTargetFramework) {
    return undefined;
  }
  return diagnostic("DOTNET_REFLECTION_TARGET_FRAMEWORK_UNSUPPORTED", ".NET reflection provider target framework is not supported by the active provider runtime.", {
    supportedTargetFramework: dotnetReflectionSupportedTargetFramework,
    targetFramework,
  });
}

export function pushDotnetReflectionReferenceArgs(
  args: string[],
  context: DotnetProviderModuleContext,
  options: DotnetReflectionCacheRequestOptions,
): void {
  if (options.referenceDirectory !== undefined) {
    args.push("--reference-dir", options.referenceDirectory);
  }
  for (const reference of [...(context.references ?? []), ...(options.references ?? [])]) {
    args.push("--reference", reference);
  }
  if (context.assemblyName !== undefined) {
    args.push("--assembly-name", context.assemblyName);
  }
}

export function moduleMemoryCacheKey(request: DotnetProviderCacheRequest): string {
  return JSON.stringify(request);
}

function sortedNonEmpty(values: readonly string[] | undefined): readonly string[] | undefined {
  return values === undefined || values.length === 0 ? undefined : [...new Set(values)].sort();
}
