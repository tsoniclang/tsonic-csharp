import { performance } from "node:perf_hooks";
import type {
  ProviderDeclarationModel,
  TargetBindingFact,
} from "@tsonic/tsts";
import type {
  DotnetModuleModel,
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
import type {
  DotnetReflectionProviderBroker,
} from "./broker.js";
import {
  dotnetModuleSpecifierForMetadataName,
  dotnetModuleSpecifierForTargetId,
} from "../module-lookup.js";
import {
  dotnetProviderGlobalTelemetry,
} from "./telemetry.js";
import type {
  DotnetProviderTelemetry,
  DotnetProviderTelemetrySnapshot,
} from "./telemetry.js";
import {
  createDotnetProviderToolRunner,
} from "./tool.js";
import {
  countProviderVirtualDeclarations,
} from "./declaration-count.js";
import {
  diagnostic,
  isDotnetProviderDiagnostic,
} from "./diagnostics.js";
import {
  defaultProviderCacheRoot,
  defaultToolBuildRoot,
  defaultToolProjectPath,
} from "./paths.js";
import {
  validateModuleSatisfiesRequest,
} from "./module-request-validation.js";
import {
  createDotnetTargetBindingIndex,
} from "./target-binding-index.js";
import {
  createDotnetReflectionCacheRequest,
  moduleMemoryCacheKey,
  pushDotnetReflectionReferenceArgs,
  validateDotnetReflectionTargetFramework,
} from "./cache-request.js";
import {
  dotnetReflectionProviderIdentity,
} from "./provider-identity.js";

export interface DotnetReflectionTypeDataProviderOptions {
  readonly toolProjectPath?: string;
  readonly referenceDirectory?: string;
  readonly references?: readonly string[];
  readonly targetFramework?: string;
  readonly toolBuildRoot?: string;
  readonly cacheRoot?: string;
  readonly disablePersistentCache?: boolean;
  readonly providerBroker?: DotnetReflectionProviderBroker;
  readonly telemetry?: DotnetProviderTelemetry;
}

export interface DotnetReflectionTypeDataProvider extends DotnetTypeDataProvider {
  findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined;
  findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined;
  getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot;
}

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions = {},
): DotnetReflectionTypeDataProvider {
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  const targetBindingIndex = createDotnetTargetBindingIndex();
  const toolProjectPath = options.toolProjectPath ?? defaultToolProjectPath();
  const telemetry = options.telemetry ?? dotnetProviderGlobalTelemetry;
  telemetry.providerInstance();
  const toolBuildRoot = options.toolBuildRoot ?? defaultToolBuildRoot();
  const toolRunner = createDotnetProviderToolRunner({
    toolProjectPath,
    toolBuildRoot,
    telemetry,
  });
  const providerBroker = options.providerBroker;
  const persistentCache = options.disablePersistentCache === true
    ? undefined
    : createDotnetProviderCache(options.cacheRoot ?? defaultProviderCacheRoot(), telemetry);

  function loadModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult {
    telemetry.request("module");
    telemetry.moduleRequest(context);
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
    const brokerModule = providerBroker?.readModule(cacheRequest);
    if (brokerModule !== undefined) {
      const brokerDiagnostic = validateModuleSatisfiesRequest(brokerModule, cacheRequest);
      if (brokerDiagnostic !== undefined) {
        diagnostics.set(memoryKey, brokerDiagnostic);
        providerBroker?.writeDiagnostic(cacheRequest, brokerDiagnostic);
        telemetry.memoryCacheHit();
        return brokerDiagnostic;
      }
      rememberModule(memoryKey, brokerModule);
      telemetry.memoryCacheHit();
      return brokerModule;
    }
    const existingDiagnostic = diagnostics.get(memoryKey);
    if (existingDiagnostic !== undefined) {
      telemetry.memoryCacheHit();
      return existingDiagnostic;
    }
    const brokerDiagnostic = providerBroker?.readDiagnostic(cacheRequest);
    if (brokerDiagnostic !== undefined) {
      diagnostics.set(memoryKey, brokerDiagnostic);
      telemetry.memoryCacheHit();
      return brokerDiagnostic;
    }
    telemetry.memoryCacheMiss();
    return loadSingleModule(cacheRequest, context);
  }

  function loadSingleModule(
    cacheRequest: DotnetProviderCacheRequest,
    context: DotnetProviderModuleContext,
  ): DotnetProviderModuleResult {
    const targetFrameworkDiagnostic = validateDotnetReflectionTargetFramework(context, options);
    if (targetFrameworkDiagnostic !== undefined) {
      return targetFrameworkDiagnostic;
    }
    const memoryKey = moduleMemoryCacheKey(cacheRequest);
    const cached = persistentCache?.readModule(cacheRequest);
    if (cached !== undefined) {
      const module = augmentDotnetModuleWithNativeArray(cached, context);
      const cachedDiagnostic = validateModuleSatisfiesRequest(module, cacheRequest);
      if (cachedDiagnostic !== undefined) {
        diagnostics.set(memoryKey, cachedDiagnostic);
        providerBroker?.writeDiagnostic(cacheRequest, cachedDiagnostic);
        return cachedDiagnostic;
      }
      rememberModule(memoryKey, module);
      providerBroker?.writeModule(cacheRequest, module);
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
      for (const targetId of context.requestedTargetIds ?? []) {
        args.push("--target-id", targetId);
      }
      for (const metadataName of context.requestedMetadataNames ?? []) {
        args.push("--metadata-name", metadataName);
      }
    }
    pushDotnetReflectionReferenceArgs(args, context, options);
    const result = toolRunner.run(args);
    if (result.status !== 0) {
      const error = diagnostic("DOTNET_REFLECTION_PROVIDER_FAILED", ".NET reflection provider tool failed.", {
        specifier: cacheRequest.moduleSpecifier,
        status: result.status,
        stderr: result.stderr,
      });
      diagnostics.set(memoryKey, error);
      providerBroker?.writeDiagnostic(cacheRequest, error);
      return error;
    }
    try {
      const rawModule = JSON.parse(result.stdout) as DotnetModuleModel;
      persistentCache?.writeModule(cacheRequest, rawModule);
      telemetry.modelBytes(result.stdout.length);
      const module = augmentDotnetModuleWithNativeArray(rawModule, context);
      const moduleDiagnostic = validateModuleSatisfiesRequest(module, cacheRequest);
      if (moduleDiagnostic !== undefined) {
        diagnostics.set(memoryKey, moduleDiagnostic);
        providerBroker?.writeDiagnostic(cacheRequest, moduleDiagnostic);
        return moduleDiagnostic;
      }
      rememberModule(memoryKey, module);
      providerBroker?.writeModule(cacheRequest, module);
      return module;
    } catch (error) {
      const parseError = diagnostic("DOTNET_REFLECTION_PROVIDER_INVALID_JSON", ".NET reflection provider emitted invalid JSON.", {
        specifier: cacheRequest.moduleSpecifier,
        error: error instanceof Error ? error.message : String(error),
      });
      diagnostics.set(memoryKey, parseError);
      providerBroker?.writeDiagnostic(cacheRequest, parseError);
      return parseError;
    }
  }

  function createCacheRequest(
    specifier: string,
    namespaceName: string,
    context: DotnetProviderModuleContext,
  ): DotnetProviderCacheRequest {
    return createDotnetReflectionCacheRequest({
      specifier,
      namespaceName,
      context,
      options,
      toolIdentity: toolRunner.identity,
    });
  }

  return {
    identity: dotnetReflectionProviderIdentity,
    ownsModule(specifier: string): DotnetProviderOwnership {
      return parseDotnetModuleSpecifier(specifier) === undefined ? { kind: "unowned" } : { kind: "owned" };
    },
    getModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult {
      return loadModule(specifier, context);
    },
    recordVirtualDeclarationModel(model: ProviderDeclarationModel, elapsedMs: number): void {
      const startedAt = performance.now();
      const declarationCount = countProviderVirtualDeclarations(model);
      const declarationBytes = JSON.stringify(model).length;
      const instrumentationElapsedMs = performance.now() - startedAt;
      telemetry.virtualDeclarations(
        declarationCount,
        declarationBytes,
        elapsedMs + instrumentationElapsedMs,
      );
    },
    findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined {
      telemetry.request("targetBindingByTargetId");
      const existing = targetBindingIndex.getByTargetId(targetId);
      if (existing !== undefined) {
        return existing;
      }
      const moduleSpecifier = dotnetModuleSpecifierForTargetId(targetId);
      if (moduleSpecifier === undefined) {
        return undefined;
      }
      const loaded = loadModule(moduleSpecifier, { requestedTargetIds: [targetId] });
      if (isDotnetProviderDiagnostic(loaded)) {
        return undefined;
      }
      return targetBindingIndex.getByTargetId(targetId);
    },
    findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined {
      telemetry.request("targetBindingByMetadataName");
      const existing = targetBindingIndex.getUniqueByMetadataName(metadataName);
      if (existing !== undefined) {
        return existing;
      }
      const moduleSpecifier = dotnetModuleSpecifierForMetadataName(metadataName);
      if (moduleSpecifier === undefined) {
        return undefined;
      }
      const loaded = loadModule(moduleSpecifier, { requestedMetadataNames: [metadataName] });
      if (isDotnetProviderDiagnostic(loaded)) {
        return undefined;
      }
      return targetBindingIndex.getUniqueByMetadataName(metadataName);
    },
    getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot {
      return telemetry.snapshot();
    },
  };

  function rememberModule(memoryKey: string, module: DotnetModuleModel): void {
    modules.set(memoryKey, module);
    targetBindingIndex.rememberModule(module);
  }
}
