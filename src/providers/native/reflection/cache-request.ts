import type {
  DotnetProviderDeclarationContext,
  DotnetProviderDiagnostic,
} from "../provider.js";
import type {
  ProviderDeclarationMaterialization,
} from "@tsonic/tsts";
import type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifierPolicy,
} from "../modules/specifier.js";
import {
  normalizeDotnetAssemblySourcePackages,
} from "../modules/specifier.js";
import type {
  DotnetProviderIdentity,
} from "../model/index.js";
import type {
  DotnetProviderCacheRequest,
} from "./cache.js";
import type {
  DotnetProviderToolIdentity,
} from "./tool.js";
import type {
  DotnetReferenceSnapshot,
} from "./reference-snapshot.js";
import {
  diagnostic,
} from "./diagnostics.js";
import {
  dotnetReflectionProviderCacheAbiVersion,
  dotnetReflectionProviderIdentity,
} from "./provider-identity.js";
import { defaultCsharpTargetFramework, parseCsharpTargetFramework } from "../../../target-model/configuration/framework.js";

export interface DotnetReflectionCacheRequestOptions {
  readonly providerIdentity?: DotnetProviderIdentity;
  readonly moduleSpecifierPolicy?: DotnetModuleSpecifierPolicy;
  readonly assemblySourcePackages?: readonly DotnetAssemblySourcePackage[];
  readonly referenceDirectory?: string;
  readonly references?: readonly string[];
  readonly targetFramework?: string;
}

export interface CreateDotnetReflectionCacheRequestInput {
  readonly specifier: string;
  readonly namespaceName: string;
  readonly context: DotnetProviderDeclarationContext;
  readonly options: DotnetReflectionCacheRequestOptions;
  readonly toolIdentity: DotnetProviderToolIdentity;
  readonly referenceSnapshot: DotnetReferenceSnapshot;
}

export function createDotnetReflectionCacheRequest(
  input: CreateDotnetReflectionCacheRequestInput,
): DotnetProviderCacheRequest {
  return {
    providerId: input.options.providerIdentity?.id ?? dotnetReflectionProviderIdentity.id,
    providerVersion: input.options.providerIdentity?.version ?? dotnetReflectionProviderIdentity.version,
    providerCacheAbiVersion: dotnetReflectionProviderCacheAbiVersion,
    targetFramework: input.context.targetFramework ?? input.options.targetFramework ?? defaultCsharpTargetFramework,
    moduleSpecifier: input.specifier,
    namespaceName: input.namespaceName,
    requestedExports: sortedNonEmpty(input.context.requestedExports),
    requestedTargetIds: sortedNonEmpty(input.context.requestedTargetIds),
    requestedMetadataNames: sortedNonEmpty(input.context.requestedMetadataNames),
    materialization: normalizeProviderMaterialization(input.context.materialization),
    broadImport: input.context.broadImport,
    assemblyName: input.context.assemblyName,
    referenceSnapshotDigest: input.referenceSnapshot.digest,
    assemblySourcePackages: normalizeDotnetAssemblySourcePackages(input.options.assemblySourcePackages),
    toolIdentity: input.toolIdentity,
  };
}

export function validateDotnetReflectionTargetFramework(
  context: DotnetProviderDeclarationContext,
  options: DotnetReflectionCacheRequestOptions,
): DotnetProviderDiagnostic | undefined {
  const targetFramework = context.targetFramework ?? options.targetFramework ?? defaultCsharpTargetFramework;
  try {
    parseCsharpTargetFramework(targetFramework);
  } catch (error) {
    return diagnostic("DOTNET_REFLECTION_TARGET_FRAMEWORK_UNSUPPORTED", String(error), { targetFramework });
  }
  if (options.targetFramework !== undefined && options.targetFramework !== targetFramework) {
    return diagnostic("DOTNET_REFLECTION_TARGET_FRAMEWORK_MISMATCH", ".NET reflection request does not match its compilation framework.", {
      selectedTargetFramework: options.targetFramework,
      targetFramework,
    });
  }
  return undefined;
}

export function pushDotnetReflectionReferenceArgs(
  args: string[],
  context: DotnetProviderDeclarationContext,
  options: DotnetReflectionCacheRequestOptions,
  referenceSnapshot: DotnetReferenceSnapshot,
): void {
  if (options.moduleSpecifierPolicy !== undefined) {
    args.push("--source-package", options.moduleSpecifierPolicy.packageName);
  }
  for (const sourcePackage of normalizeDotnetAssemblySourcePackages(options.assemblySourcePackages)) {
    args.push("--assembly-source-package", `${sourcePackage.assemblyName}=${sourcePackage.packageName}`);
  }
  referenceSnapshot.appendToolArguments(args);
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

function normalizeProviderMaterialization(
  materialization: ProviderDeclarationMaterialization,
): ProviderDeclarationMaterialization {
  if (materialization.kind === "complete") {
    return Object.freeze({ kind: "complete" });
  }
  return Object.freeze({
    kind: "incremental",
    completeExports: Object.freeze([...materialization.completeExports]
      .map((request) => Object.freeze({
        exportName: request.exportName,
        ...(request.exportId === undefined ? {} : { exportId: request.exportId }),
      }))
      .sort((left, right) => left.exportName < right.exportName
        ? -1
        : left.exportName > right.exportName
          ? 1
          : (left.exportId ?? "") < (right.exportId ?? "")
            ? -1
            : (left.exportId ?? "") > (right.exportId ?? "")
              ? 1
              : 0)),
  });
}
