import { performance } from "node:perf_hooks";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
} from "@tsonic/tsts";
import type {
  TargetBindingFact,
} from "../../../policy/types/index.js";
import type {
  DotnetModuleModel,
} from "../model.js";
import {
  dotnetModuleSpecifierPolicy,
  normalizeDotnetAssemblySourcePackages,
  parseDotnetModuleSpecifier,
} from "../module-specifier.js";
import type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifierPolicy,
} from "../module-specifier.js";
import type {
  DotnetProviderIdentity,
} from "../model.js";
import {
  validateDotnetModuleModelContract,
} from "../model-contract.js";
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
  resolveDotnetProviderDeclarationProjection,
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
  missingDotnetSameModuleProviderRefExports,
} from "../provider-slices.js";
import {
  createDotnetTargetBindingIndex,
} from "./target-binding-index.js";
import {
  dotnetProviderTargetRelationTemplates,
} from "../target-relations.js";
import type {
  DotnetProviderTargetRelationTemplate,
} from "../target-relations.js";
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
  readonly providerIdentity?: DotnetProviderIdentity;
  readonly moduleSpecifierPolicy?: DotnetModuleSpecifierPolicy;
  readonly assemblySourcePackages?: readonly DotnetAssemblySourcePackage[];
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
  resolveTargetRelations(
    request: DotnetProviderTargetRelationRequest,
  ): readonly DotnetProviderTargetRelationTemplate[] | ExtensionDiagnostic;
  getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot;
}

export interface DotnetProviderTargetRelationRequest {
  readonly moduleSpecifier: string;
  readonly providerModuleId: string;
  readonly artifactFileName: string;
  readonly exportName: string;
}

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions = {},
): DotnetReflectionTypeDataProvider {
  const providerIdentity = options.providerIdentity ?? dotnetReflectionProviderIdentity;
  const moduleSpecifierPolicy = options.moduleSpecifierPolicy ?? dotnetModuleSpecifierPolicy;
  const assemblySourcePackages = normalizeDotnetAssemblySourcePackages(options.assemblySourcePackages);
  const reflectionOptions = {
    ...options,
    providerIdentity,
    moduleSpecifierPolicy,
    assemblySourcePackages,
  };
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
    const parsed = parseDotnetModuleSpecifier(specifier, moduleSpecifierPolicy);
    if (parsed === undefined) {
      return diagnostic("DOTNET_REFLECTION_SPECIFIER_INVALID", `.NET reflection provider does not own '${specifier}'.`, { specifier });
    }
    const effectiveContext = contextWithParsedExternAlias(context, parsed.externAlias);
    if (isProviderContextDiagnostic(effectiveContext)) {
      return effectiveContext;
    }
    const cacheRequest = createCacheRequest(specifier, parsed.namespaceName, effectiveContext);
    const memoryKey = moduleMemoryCacheKey(cacheRequest);
    const existing = modules.get(memoryKey);
    if (existing !== undefined) {
      telemetry.memoryCacheHit();
      return completeSameModuleProviderRefClosure(specifier, effectiveContext, existing);
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
      const contractDiagnostic = validateLoadedModuleContract(memoryKey, cacheRequest, brokerModule);
      if (contractDiagnostic !== undefined) {
        telemetry.memoryCacheHit();
        return contractDiagnostic;
      }
      rememberModule(memoryKey, brokerModule);
      telemetry.memoryCacheHit();
      return completeSameModuleProviderRefClosure(specifier, effectiveContext, brokerModule);
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
    return completeSameModuleProviderRefClosure(specifier, effectiveContext, loadSingleModule(cacheRequest, effectiveContext));
  }

  function completeSameModuleProviderRefClosure(
    specifier: string,
    moduleContext: DotnetProviderModuleContext,
    moduleResult: DotnetProviderModuleResult,
  ): DotnetProviderModuleResult {
    if (isDotnetProviderDiagnostic(moduleResult) || moduleContext.broadImport === true || moduleContext.requestedExports === undefined) {
      return moduleResult;
    }
    const currentRequestedExports = moduleContext.requestedExports;
    const missingExports = missingDotnetSameModuleProviderRefExports(moduleResult, currentRequestedExports);
    if (missingExports.length === 0) {
      return moduleResult;
    }
    const requestedExports = sortedUnique([
      ...currentRequestedExports,
      ...missingExports,
    ]);
    if (missingExports.every((exportName) => currentRequestedExports.includes(exportName))) {
      return diagnostic("DOTNET_REFLECTION_PROVIDER_REF_CLOSURE_MISSING", ".NET reflection provider emitted same-module provider references that it could not prove as source exports.", {
        specifier,
        missingExports,
      });
    }
    return loadModule(specifier, { ...moduleContext, requestedExports });
  }

  function loadSingleModule(
    cacheRequest: DotnetProviderCacheRequest,
    context: DotnetProviderModuleContext,
  ): DotnetProviderModuleResult {
    const targetFrameworkDiagnostic = validateDotnetReflectionTargetFramework(context, reflectionOptions);
    if (targetFrameworkDiagnostic !== undefined) {
      return targetFrameworkDiagnostic;
    }
    const memoryKey = moduleMemoryCacheKey(cacheRequest);
    const cached = persistentCache?.readModule(cacheRequest);
    if (cached !== undefined) {
      const module = augmentDotnetModuleWithNativeArray(cached, context);
      const cachedDiagnostic = validateModuleSatisfiesRequest(module, cacheRequest);
      const contractDiagnostic = validateDotnetModuleModelContract(module);
      if (
        cachedDiagnostic === undefined &&
        contractDiagnostic === undefined
      ) {
        rememberModule(memoryKey, module);
        providerBroker?.writeModule(cacheRequest, module);
        telemetry.modelBytes(JSON.stringify(cached).length);
        return module;
      }
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
    pushDotnetReflectionReferenceArgs(args, context, reflectionOptions);
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
      telemetry.modelBytes(result.stdout.length);
      const module = augmentDotnetModuleWithNativeArray(rawModule, context);
      const moduleDiagnostic = validateModuleSatisfiesRequest(module, cacheRequest);
      if (moduleDiagnostic !== undefined) {
        diagnostics.set(memoryKey, moduleDiagnostic);
        providerBroker?.writeDiagnostic(cacheRequest, moduleDiagnostic);
        return moduleDiagnostic;
      }
      const contractDiagnostic = validateLoadedModuleContract(memoryKey, cacheRequest, module);
      if (contractDiagnostic !== undefined) {
        return contractDiagnostic;
      }
      persistentCache?.writeModule(cacheRequest, rawModule);
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
      options: reflectionOptions,
      toolIdentity: toolRunner.identity,
    });
  }

  function sortedUnique(values: readonly string[]): readonly string[] {
    return [...new Set(values)].sort();
  }

  const typeDataProvider: DotnetReflectionTypeDataProvider = {
    identity: providerIdentity,
    ownsModule(specifier: string): DotnetProviderOwnership {
      return parseDotnetModuleSpecifier(specifier, moduleSpecifierPolicy) === undefined ? { kind: "unowned" } : { kind: "owned" };
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
      const moduleSpecifier = dotnetModuleSpecifierForTargetId(targetId, moduleSpecifierPolicy);
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
      const moduleSpecifier = dotnetModuleSpecifierForMetadataName(metadataName, moduleSpecifierPolicy);
      if (moduleSpecifier === undefined) {
        return undefined;
      }
      const loaded = loadModule(moduleSpecifier, { requestedMetadataNames: [metadataName] });
      if (isDotnetProviderDiagnostic(loaded)) {
        return undefined;
      }
      return targetBindingIndex.getUniqueByMetadataName(metadataName);
    },
    resolveTargetRelations(
      request: DotnetProviderTargetRelationRequest,
    ): readonly DotnetProviderTargetRelationTemplate[] | ExtensionDiagnostic {
      const model = resolveDotnetProviderDeclarationProjection(
        {
          provider: typeDataProvider,
          moduleSpecifierPolicy,
          references: options.references,
          targetFramework: options.targetFramework,
        },
        providerIdentity.id,
        {
          kind: "virtual",
          moduleSpecifier: request.moduleSpecifier,
          virtualFileName: request.artifactFileName,
          providerModuleId: request.providerModuleId,
        },
        { requestedExports: [request.exportName] },
        moduleSpecifierPolicy,
      );
      if ("extensionId" in model) {
        return model;
      }
      return dotnetProviderTargetRelationTemplates(model, targetBindingIndex);
    },
    getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot {
      return telemetry.snapshot();
    },
  };
  return typeDataProvider;

  function rememberModule(memoryKey: string, module: DotnetModuleModel): void {
    modules.set(memoryKey, module);
    targetBindingIndex.rememberModule(module);
  }

  function validateLoadedModuleContract(
    memoryKey: string,
    cacheRequest: DotnetProviderCacheRequest,
    module: DotnetModuleModel,
  ): DotnetProviderDiagnostic | undefined {
    const contractDiagnostic = validateDotnetModuleModelContract(module);
    if (contractDiagnostic === undefined) {
      return undefined;
    }
    diagnostics.set(memoryKey, contractDiagnostic);
    providerBroker?.writeDiagnostic(cacheRequest, contractDiagnostic);
    return contractDiagnostic;
  }

  function contextWithParsedExternAlias(
    context: DotnetProviderModuleContext,
    externAlias: NonNullable<ReturnType<typeof parseDotnetModuleSpecifier>>["externAlias"],
  ): DotnetProviderModuleContext | DotnetProviderDiagnostic {
    if (externAlias === undefined) {
      return context;
    }
    if (context.assemblyName !== undefined && context.assemblyName !== externAlias.assemblyName) {
      return diagnostic("DOTNET_REFLECTION_ALIAS_CONTEXT_CONFLICT", ".NET reflection provider alias module context conflicts with the alias module specifier.", {
        moduleAssemblyName: externAlias.assemblyName,
        contextAssemblyName: context.assemblyName,
      });
    }
    if (context.externAlias !== undefined && context.externAlias !== externAlias.alias) {
      return diagnostic("DOTNET_REFLECTION_ALIAS_CONTEXT_CONFLICT", ".NET reflection provider alias module context conflicts with the alias module specifier.", {
        moduleAlias: externAlias.alias,
        contextAlias: context.externAlias,
      });
    }
    return {
      ...context,
      assemblyName: externAlias.assemblyName,
      externAlias: externAlias.alias,
    };
  }

  function isProviderContextDiagnostic(
    value: DotnetProviderModuleContext | DotnetProviderDiagnostic,
  ): value is DotnetProviderDiagnostic {
    return "code" in value && "message" in value;
  }
}
