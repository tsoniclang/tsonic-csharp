import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TargetBindingFact } from "@tsonic/tsts";
import type {
  DotnetModuleModel,
  DotnetProviderIdentity,
} from "../model.js";
import {
  dotnetExportToTargetBinding,
} from "../model.js";
import {
  parseDotnetModuleSpecifier,
} from "../module-specifier.js";
import {
  augmentDotnetModuleWithNativeArray,
} from "../native-array.js";
import type {
  DotnetProviderDiagnostic,
  DotnetProviderModuleContext,
  DotnetProviderModuleResult,
  DotnetProviderOwnership,
  DotnetTypeDataProvider,
} from "../provider.js";
import {
  createDotnetProviderCache,
} from "./cache.js";
import type {
  DotnetProviderCacheRequest,
} from "./cache.js";
import {
  dotnetModuleSpecifierForMetadataName,
  dotnetModuleSpecifierForTargetId,
} from "./module-lookup.js";
import {
  dotnetProviderGlobalTelemetry,
} from "./telemetry.js";
import type {
  DotnetProviderTelemetry,
  DotnetProviderTelemetrySnapshot,
} from "./telemetry.js";
import {
  createDotnetProviderToolRunner,
  referenceIdentities,
} from "./tool.js";

export interface DotnetReflectionTypeDataProviderOptions {
  readonly toolProjectPath?: string;
  readonly referenceDirectory?: string;
  readonly references?: readonly string[];
  readonly targetFramework?: string;
  readonly toolBuildRoot?: string;
  readonly cacheRoot?: string;
  readonly disablePersistentCache?: boolean;
  readonly telemetry?: DotnetProviderTelemetry;
}

export interface DotnetReflectionTypeDataProvider extends DotnetTypeDataProvider {
  findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined;
  findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined;
  getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot;
}

const providerIdentity: DotnetProviderIdentity = {
  id: "tsonic.csharp.dotnet-reflection-provider",
  version: "0.0.1",
  target: "csharp",
  displayName: "Tsonic C# .NET reflection provider",
};
const supportedTargetFramework = "net10.0";

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions = {},
): DotnetReflectionTypeDataProvider {
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  const toolProjectPath = options.toolProjectPath ?? defaultToolProjectPath();
  const telemetry = options.telemetry ?? dotnetProviderGlobalTelemetry;
  telemetry.providerInstance();
  const toolBuildRoot = options.toolBuildRoot ?? defaultToolBuildRoot();
  const toolRunner = createDotnetProviderToolRunner({
    toolProjectPath,
    toolBuildRoot,
    telemetry,
  });
  const persistentCache = options.disablePersistentCache === true
    ? undefined
    : createDotnetProviderCache(options.cacheRoot ?? defaultProviderCacheRoot(), telemetry);

  function loadModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult {
    telemetry.request("module");
    const parsed = parseDotnetModuleSpecifier(specifier);
    if (parsed === undefined) {
      return diagnostic("DOTNET_REFLECTION_SPECIFIER_INVALID", `.NET reflection provider does not own '${specifier}'.`, { specifier });
    }
    const cacheRequest = createCacheRequest(specifier, parsed.namespaceName, context);
    const memoryKey = moduleMemoryCacheKey(cacheRequest);
    const existing = modules.get(memoryKey);
    if (existing !== undefined) {
      telemetry.memoryCacheHit();
      return existing;
    }
    telemetry.memoryCacheMiss();
    const existingDiagnostic = diagnostics.get(memoryKey);
    if (existingDiagnostic !== undefined) {
      return existingDiagnostic;
    }
    return loadSingleModule(cacheRequest, context);
  }

  function loadSingleModule(
    cacheRequest: DotnetProviderCacheRequest,
    context: DotnetProviderModuleContext,
  ): DotnetProviderModuleResult {
    const targetFrameworkDiagnostic = validateTargetFramework(context);
    if (targetFrameworkDiagnostic !== undefined) {
      return targetFrameworkDiagnostic;
    }
    const memoryKey = moduleMemoryCacheKey(cacheRequest);
    const cached = persistentCache?.readModule(cacheRequest);
    if (cached !== undefined) {
      const module = augmentDotnetModuleWithNativeArray(cached);
      modules.set(memoryKey, module);
      telemetry.modelBytes(JSON.stringify(cached).length);
      return module;
    }
    const args = [
      "--namespace",
      cacheRequest.namespaceName,
      "--module-specifier",
      cacheRequest.moduleSpecifier,
    ];
    if (context.broadImport !== true) {
      for (const exportName of context.requestedExports ?? []) {
        args.push("--export", exportName);
      }
    }
    pushReferenceArgs(args, context);
    const result = toolRunner.run(args);
    if (result.status !== 0) {
      const error = diagnostic("DOTNET_REFLECTION_PROVIDER_FAILED", ".NET reflection provider tool failed.", {
        specifier: cacheRequest.moduleSpecifier,
        status: result.status,
        stderr: result.stderr,
      });
      diagnostics.set(memoryKey, error);
      return error;
    }
    try {
      const rawModule = JSON.parse(result.stdout) as DotnetModuleModel;
      persistentCache?.writeModule(cacheRequest, rawModule);
      telemetry.modelBytes(result.stdout.length);
      const module = augmentDotnetModuleWithNativeArray(rawModule);
      modules.set(memoryKey, module);
      return module;
    } catch (error) {
      const parseError = diagnostic("DOTNET_REFLECTION_PROVIDER_INVALID_JSON", ".NET reflection provider emitted invalid JSON.", {
        specifier: cacheRequest.moduleSpecifier,
        error: error instanceof Error ? error.message : String(error),
      });
      diagnostics.set(memoryKey, parseError);
      return parseError;
    }
  }

  function createCacheRequest(
    specifier: string,
    namespaceName: string,
    context: DotnetProviderModuleContext,
  ): DotnetProviderCacheRequest {
    return {
      providerId: providerIdentity.id,
      providerVersion: providerIdentity.version,
      targetFramework: context.targetFramework ?? options.targetFramework ?? supportedTargetFramework,
      moduleSpecifier: specifier,
      namespaceName,
      requestedExports: context.requestedExports,
      broadImport: context.broadImport,
      referenceDirectory: options.referenceDirectory,
      referenceIdentities: referenceIdentities([...(context.references ?? []), ...(options.references ?? [])]),
      toolIdentity: toolRunner.identity,
    };
  }

  function validateTargetFramework(context: DotnetProviderModuleContext): DotnetProviderDiagnostic | undefined {
    const targetFramework = context.targetFramework ?? options.targetFramework;
    if (targetFramework === undefined || targetFramework === supportedTargetFramework) {
      return undefined;
    }
    return diagnostic("DOTNET_REFLECTION_TARGET_FRAMEWORK_UNSUPPORTED", ".NET reflection provider target framework is not supported by the active provider runtime.", {
      supportedTargetFramework,
      targetFramework,
    });
  }

  function pushReferenceArgs(args: string[], context: DotnetProviderModuleContext): void {
    if (options.referenceDirectory !== undefined) {
      args.push("--reference-dir", options.referenceDirectory);
    }
    for (const reference of [...(context.references ?? []), ...(options.references ?? [])]) {
      args.push("--reference", reference);
    }
  }

  return {
    identity: providerIdentity,
    ownsModule(specifier: string): DotnetProviderOwnership {
      return parseDotnetModuleSpecifier(specifier) === undefined ? { kind: "unowned" } : { kind: "owned" };
    },
    getModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult {
      return loadModule(specifier, context);
    },
    findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined {
      const existing = findTargetBindingInLoadedModules(modules, targetId);
      if (existing !== undefined) {
        return existing;
      }
      const moduleSpecifier = dotnetModuleSpecifierForTargetId(targetId);
      if (moduleSpecifier === undefined) {
        return undefined;
      }
      const loaded = loadModule(moduleSpecifier, {});
      if (isDotnetProviderDiagnostic(loaded)) {
        return undefined;
      }
      return findTargetBindingInLoadedModules(modules, targetId);
    },
    findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined {
      const existing = findUniqueTargetBindingByMetadataNameInLoadedModules(modules, metadataName);
      if (existing !== undefined) {
        return existing;
      }
      const moduleSpecifier = dotnetModuleSpecifierForMetadataName(metadataName);
      if (moduleSpecifier === undefined) {
        return undefined;
      }
      const loaded = loadModule(moduleSpecifier, {});
      if (isDotnetProviderDiagnostic(loaded)) {
        return undefined;
      }
      return findUniqueTargetBindingByMetadataNameInLoadedModules(modules, metadataName);
    },
    getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot {
      return telemetry.snapshot();
    },
  };
}

function isDotnetProviderDiagnostic(value: DotnetProviderModuleResult): value is DotnetProviderDiagnostic {
  return "code" in value && "message" in value;
}

function moduleMemoryCacheKey(request: DotnetProviderCacheRequest): string {
  return JSON.stringify(request);
}

function findTargetBindingInLoadedModules(
  modules: ReadonlyMap<string, DotnetModuleModel>,
  targetId: string,
): TargetBindingFact | undefined {
  for (const module of modules.values()) {
    const binding = findTargetBindingInModule(module, targetId);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

function findTargetBindingInModule(module: DotnetModuleModel, targetId: string): TargetBindingFact | undefined {
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind === "type" && declaration.targetId === targetId) {
      return dotnetExportToTargetBinding(declaration);
    }
  }
  return undefined;
}

function findUniqueTargetBindingByMetadataNameInLoadedModules(
  modules: ReadonlyMap<string, DotnetModuleModel>,
  metadataName: string,
): TargetBindingFact | undefined {
  let result: TargetBindingFact | undefined;
  for (const module of modules.values()) {
    const binding = findUniqueTargetBindingByMetadataNameInModule(module, metadataName);
    if (binding === undefined) {
      continue;
    }
    if (result !== undefined && result.id !== binding.id) {
      return undefined;
    }
    result = binding;
  }
  return result;
}

function findUniqueTargetBindingByMetadataNameInModule(
  module: DotnetModuleModel,
  metadataName: string,
): TargetBindingFact | undefined {
  let result: TargetBindingFact | undefined;
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind !== "type" || declaration.metadataName !== metadataName) {
      continue;
    }
    const binding = dotnetExportToTargetBinding(declaration);
    if (binding === undefined) {
      continue;
    }
    if (result !== undefined && result.id !== binding.id) {
      return undefined;
    }
    result = binding;
  }
  return result;
}

function diagnostic(
  code: string,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
): DotnetProviderDiagnostic {
  return {
    code,
    message,
    evidence: [evidence],
  };
}

function defaultToolProjectPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tools/dotnet-type-provider/DotnetTypeProvider.csproj");
}

function defaultToolBuildRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.temp/dotnet-type-provider-tool");
}

function defaultProviderCacheRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.temp/provider-cache/dotnet-reflection");
}
