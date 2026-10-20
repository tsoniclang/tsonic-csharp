import { performance } from "node:perf_hooks";
import { isAbsolute } from "node:path";
import type { ExtensionDiagnostic, ProviderDeclarationMaterialization, ProviderDeclarationModel } from "@tsonic/tsts";
import type { CsharpProviderBindingLookupPurpose, CsharpProviderBindingResolution } from "../../../target-model/metadata/provider-metadata.js";
import { assertCsharpProviderLookupPurpose } from "../../model/relation-resolver.js";
import type { CsharpProviderRuntimePreparation, CsharpProviderRuntimeAcquisition } from "../../model/relation-resolver.js";
import { acquireCsharpRuntimeSources } from "./runtime-sources.js";
import type { DotnetModuleModel, DotnetTypeDeclaration } from "../model/index.js";
import { dotnetModuleSpecifierPolicy, normalizeDotnetAssemblySourcePackages, parseDotnetModuleSpecifier } from "../projection/module-specifier.js";
import type { DotnetAssemblySourcePackage, DotnetModuleSpecifierPolicy } from "../projection/module-specifier.js";
import type { DotnetProviderIdentity } from "../model/index.js";
import { validateDotnetModuleModelContract } from "../model/normalization/index.js";
import { augmentDotnetModuleWithNativeArray } from "../projection/module-native-array.js";
import type { DotnetProviderDeclarationContext, DotnetProviderDiagnostic, DotnetProviderModuleResult, DotnetProviderOwnership, DotnetTypeDataProvider } from "../projection/provider.js";
import { emptyIncrementalDotnetProviderMaterialization, resolveDotnetProviderDeclarationProjection } from "../projection/provider.js";
import { createDotnetProviderCache } from "./cache.js";
import type { DotnetProviderCacheRequest } from "./cache.js";
import type { DotnetReflectionProviderBroker } from "./broker.js";
import { dotnetModuleSpecifierForMetadataName, dotnetModuleSpecifierForTargetId } from "../projection/module-lookup.js";
import { dotnetProviderGlobalTelemetry } from "./telemetry.js";
import type { DotnetProviderTelemetry, DotnetProviderTelemetrySnapshot } from "./telemetry.js";
import { createDotnetProviderToolRunner } from "./tool.js";
import { countProviderVirtualDeclarations } from "./declaration-count.js";
import { diagnostic, isDotnetProviderDiagnostic } from "../model/diagnostics.js";
import { dotnetProviderDiagnosticToExtensionDiagnostic } from "../model/diagnostics.js";
import { defaultToolProjectPath } from "./paths.js";
import { validateModuleSatisfiesRequest } from "./module-request-validation.js";
import { missingDotnetSameModuleProviderRefExports } from "../projection/module-slices.js";
import { createDotnetTargetBindingIndex, findUniqueTargetBinding } from "./target-binding-index.js";
import { dotnetProviderTargetRelationTemplates } from "../projection/target-relations.js";
import type { DotnetProviderTargetRelationTemplate } from "../projection/target-relations.js";
import { createDotnetReflectionCacheRequest, moduleMemoryCacheKey, pushDotnetReflectionReferenceArgs, validateDotnetReflectionTargetFramework } from "./cache-request.js";
import { dotnetReflectionProviderIdentity } from "./provider-identity.js";
import { defaultCsharpTargetFramework } from "../../../target-model/configuration/framework.js";
import { resolveDotnetProviderToolchain, type DotnetProviderToolchain } from "./toolchain.js";
import { createDotnetReferenceSnapshot } from "./reference-snapshot.js";

export interface DotnetReflectionProviderStorage {
  readonly toolBuildRoot: string;
  readonly cacheRoot: string;
}

export interface DotnetReflectionTypeDataProviderOptions {
  readonly storage: DotnetReflectionProviderStorage;
  readonly providerIdentity?: DotnetProviderIdentity;
  readonly moduleSpecifierPolicy?: DotnetModuleSpecifierPolicy;
  readonly assemblySourcePackages?: readonly DotnetAssemblySourcePackage[];
  readonly toolProjectPath?: string;
  readonly referenceDirectory?: string;
  readonly references?: readonly string[];
  readonly targetFramework?: string;
  readonly disablePersistentCache?: boolean;
  readonly providerBroker?: DotnetReflectionProviderBroker;
  readonly telemetry?: DotnetProviderTelemetry;
  readonly projectDirectory?: string;
  readonly toolchain?: DotnetProviderToolchain;
}

export interface DotnetReflectionTypeDataProvider extends DotnetTypeDataProvider {
  validateReferences(): ExtensionDiagnostic | undefined;
  prepareRuntimeSources(preparation: CsharpProviderRuntimePreparation): CsharpProviderRuntimeAcquisition;
  findTargetBindingByTargetId(targetId: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution;
  findTargetBindingByMetadataName(metadataName: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution;
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
  readonly exportId: string;
}

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions,
): DotnetReflectionTypeDataProvider {
  const storage = validateProviderStorage(options?.storage);
  const providerIdentity = options.providerIdentity ?? dotnetReflectionProviderIdentity;
  const moduleSpecifierPolicy = options.moduleSpecifierPolicy ?? dotnetModuleSpecifierPolicy;
  const assemblySourcePackages = normalizeDotnetAssemblySourcePackages(options.assemblySourcePackages);
  const reflectionOptions = {
    ...options,
    providerIdentity,
    moduleSpecifierPolicy,
    assemblySourcePackages,
    targetFramework: options.targetFramework ?? defaultCsharpTargetFramework,
  };
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  const targetRelationProjections = new Map<
    string,
    readonly DotnetProviderTargetRelationTemplate[] | ExtensionDiagnostic
  >();
  const targetBindingIndex = createDotnetTargetBindingIndex();
  const toolProjectPath = options.toolProjectPath ?? defaultToolProjectPath();
  const telemetry = options.telemetry ?? dotnetProviderGlobalTelemetry;
  const toolchain = options.toolchain ?? resolveDotnetProviderToolchain(
    options.projectDirectory ?? process.cwd(), reflectionOptions.targetFramework,
  );
  telemetry.providerInstance();
  const toolRunner = createDotnetProviderToolRunner({
    toolProjectPath,
    toolBuildRoot: storage.toolBuildRoot,
    telemetry,
    targetFramework: reflectionOptions.targetFramework,
    ...(options.projectDirectory === undefined ? {} : { projectDirectory: options.projectDirectory }),
    toolchain,
  });
  const providerBroker = options.providerBroker;
  const persistentCache = options.disablePersistentCache === true
    ? undefined
    : createDotnetProviderCache(storage.cacheRoot, telemetry);
  const referenceSnapshot = createDotnetReferenceSnapshot({
    platformDirectory: toolRunner.identity.platformDirectory,
    referenceDirectory: options.referenceDirectory,
    references: options.references ?? [],
    telemetry,
  });
  let runtimePrepared = false;
  let runtimeProvider: DotnetReflectionTypeDataProvider | undefined;

  function loadModule(specifier: string, context: DotnetProviderDeclarationContext): DotnetProviderModuleResult {
    telemetry.request("module");
    telemetry.moduleRequest(context);
    const frameworkDiagnostic = validateDotnetReflectionTargetFramework(context, reflectionOptions);
    if (frameworkDiagnostic !== undefined) return frameworkDiagnostic;
    const parsed = parseDotnetModuleSpecifier(specifier, moduleSpecifierPolicy);
    if (parsed === undefined) {
      return diagnostic("DOTNET_REFLECTION_SPECIFIER_INVALID", `.NET reflection provider does not own '${specifier}'.`, { specifier });
    }
    const effectiveContext = contextWithParsedExternAlias(context, parsed.externAlias);
    if (isProviderContextDiagnostic(effectiveContext)) {
      return effectiveContext;
    }
    const referenceDiagnostic = validateReferenceSnapshot();
    if (referenceDiagnostic !== undefined) {
      return referenceDiagnostic;
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
      const bindingDiagnostic = rememberModule(memoryKey, brokerModule, cacheRequest);
      if (bindingDiagnostic !== undefined) return bindingDiagnostic;
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
    moduleContext: DotnetProviderDeclarationContext,
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
    context: DotnetProviderDeclarationContext,
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
        const bindingDiagnostic = rememberModule(memoryKey, module, cacheRequest);
        if (bindingDiagnostic !== undefined) return bindingDiagnostic;
        providerBroker?.writeModule(cacheRequest, module);
        telemetry.modelBytes(JSON.stringify(cached).length);
        return module;
      }
      persistentCache?.discardModule(cacheRequest);
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
    if (cacheRequest.materialization.kind === "complete") {
      args.push("--complete-all-exports");
    } else {
      for (const request of cacheRequest.materialization.completeExports) {
        if (request.exportId === undefined) {
          args.push("--complete-export", request.exportName);
        } else {
          args.push("--complete-export-id", request.exportId);
        }
      }
    }
    pushDotnetReflectionReferenceArgs(args, context, reflectionOptions, referenceSnapshot);
    const result = toolRunner.run(args);
    const referenceDiagnostic = validateReferenceSnapshot();
    if (referenceDiagnostic !== undefined) {
      return referenceDiagnostic;
    }
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
      const bindingDiagnostic = rememberModule(memoryKey, module, cacheRequest);
      if (bindingDiagnostic !== undefined) return bindingDiagnostic;
      persistentCache?.writeModule(cacheRequest, rawModule);
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
    context: DotnetProviderDeclarationContext,
  ): DotnetProviderCacheRequest {
    return createDotnetReflectionCacheRequest({
      specifier,
      namespaceName,
      context,
      options: reflectionOptions,
      toolIdentity: toolRunner.identity,
      referenceSnapshot,
    });
  }

  function validateReferenceSnapshot(): DotnetProviderDiagnostic | undefined {
    const mutation = referenceSnapshot.verify();
    if (mutation === undefined) {
      return undefined;
    }
    return diagnostic(
      "DOTNET_REFLECTION_REFERENCES_MUTATED",
      ".NET reference assemblies changed while the compilation was running; provider results would not be trustworthy.",
      {
        path: mutation.path,
        reason: mutation.reason,
      },
    );
  }

  function sortedUnique(values: readonly string[]): readonly string[] {
    return [...new Set(values)].sort();
  }

  const typeDataProvider: DotnetReflectionTypeDataProvider = {
    identity: providerIdentity,
    validateReferences(): ExtensionDiagnostic | undefined {
      const result = validateReferenceSnapshot();
      return result === undefined ? runtimeProvider?.validateReferences() : dotnetProviderDiagnosticToExtensionDiagnostic(providerIdentity.id, result);
    },
    prepareRuntimeSources(preparation: CsharpProviderRuntimePreparation): CsharpProviderRuntimeAcquisition {
      if (runtimePrepared) throw new TypeError("Native runtime metadata is prepared exactly once before analysis queries.");
      runtimePrepared = true;
      const acquired = preparation.project.kind !== "user-owned" && preparation.sources.length === 0
        ? Object.freeze({ kind: "resolved" as const, references: Object.freeze([]) })
        : acquireCsharpRuntimeSources(preparation, toolchain);
      if (acquired.kind === "rejected") return acquired;
      if (acquired.references.length !== 0) {
        runtimeProvider = createDotnetReflectionTypeDataProvider({
          ...options, toolchain,
          references: Object.freeze([...new Set([...(options.references ?? []), ...acquired.references])]),
        });
      }
      return acquired;
    },
    ownsModule(specifier: string): DotnetProviderOwnership {
      return parseDotnetModuleSpecifier(specifier, moduleSpecifierPolicy) === undefined ? { kind: "unowned" } : { kind: "owned" };
    },
    getModule(specifier: string, context: DotnetProviderDeclarationContext): DotnetProviderModuleResult {
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
    findTargetBindingByTargetId(targetId: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution {
      assertCsharpProviderLookupPurpose(purpose);
      telemetry.request("targetBindingByTargetId");
      const selected = findTargetBinding(
        dotnetModuleSpecifierForTargetId(targetId, moduleSpecifierPolicy),
        { requestedTargetIds: [targetId] },
        () => {
          const binding = targetBindingIndex.getByTargetId(targetId);
          return binding === undefined ? Object.freeze({ kind: "missing" }) : Object.freeze({ kind: "resolved", binding });
        },
        declaration => declaration.targetId === targetId,
      );
      return withRuntimeInheritance(selected, purpose, provider => provider.findTargetBindingByTargetId(targetId, "ordinary"));
    },
    findTargetBindingByMetadataName(metadataName: string, purpose: CsharpProviderBindingLookupPurpose): CsharpProviderBindingResolution {
      assertCsharpProviderLookupPurpose(purpose);
      telemetry.request("targetBindingByMetadataName");
      const selected = findTargetBinding(
        dotnetModuleSpecifierForMetadataName(metadataName, moduleSpecifierPolicy),
        { requestedMetadataNames: [metadataName] },
        () => findUniqueTargetBinding(targetBindingIndex.getCompleteCandidatesByMetadataName(metadataName)
          .map(binding => Object.freeze({ kind: "resolved", binding })), metadataName),
        declaration => declaration.metadataName === metadataName,
      );
      return withRuntimeInheritance(selected, purpose, provider => provider.findTargetBindingByMetadataName(metadataName, "ordinary"));
    },
    resolveTargetRelations(
      request: DotnetProviderTargetRelationRequest,
    ): readonly DotnetProviderTargetRelationTemplate[] | ExtensionDiagnostic {
      const projectionKey = targetRelationProjectionKey(request);
      const existing = targetRelationProjections.get(projectionKey);
      if (existing !== undefined) {
        const referenceDiagnostic = validateReferenceSnapshot();
        return referenceDiagnostic === undefined
          ? existing
          : dotnetProviderDiagnosticToExtensionDiagnostic(
              providerIdentity.id,
              referenceDiagnostic,
            );
      }
      const model = resolveDotnetProviderDeclarationProjection(
        {
          provider: typeDataProvider,
          moduleSpecifierPolicy,
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
        exactProviderExportMaterialization(request.exportName, request.exportId),
        moduleSpecifierPolicy,
      );
      if ("extensionId" in model) {
        targetRelationProjections.set(projectionKey, model);
        return model;
      }
      const relations = dotnetProviderTargetRelationTemplates(
        model,
        targetBindingIndex,
      );
      targetRelationProjections.set(projectionKey, relations);
      return relations;
    },
    getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot {
      return telemetry.snapshot();
    },
  };
  return typeDataProvider;

  function withRuntimeInheritance(
    selected: CsharpProviderBindingResolution,
    purpose: CsharpProviderBindingLookupPurpose,
    query: (provider: DotnetReflectionTypeDataProvider) => CsharpProviderBindingResolution,
  ): CsharpProviderBindingResolution {
    if (purpose === "ordinary" || selected.kind !== "missing") return selected;
    return runtimeProvider === undefined ? selected : query(runtimeProvider);
  }

  function findTargetBinding(
    moduleSpecifier: string | undefined,
    request: { readonly requestedTargetIds: readonly string[] } | { readonly requestedMetadataNames: readonly string[] },
    currentBinding: () => CsharpProviderBindingResolution,
    matches: (declaration: DotnetTypeDeclaration) => boolean,
  ): CsharpProviderBindingResolution {
    const rejected = (failure: DotnetProviderDiagnostic): CsharpProviderBindingResolution => Object.freeze({
      kind: "rejected", diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic(providerIdentity.id, failure),
    });
    const referenceFailure = validateReferenceSnapshot();
    if (referenceFailure !== undefined) return rejected(referenceFailure);
    const existing = currentBinding();
    if (existing.kind !== "missing") return existing;
    if (moduleSpecifier === undefined) return Object.freeze({ kind: "missing" });
    const header = loadModule(moduleSpecifier, {
      ...request, materialization: emptyIncrementalDotnetProviderMaterialization,
    });
    if (isDotnetProviderDiagnostic(header)) {
      return header.code === "DOTNET_REFLECTION_REQUESTED_DECLARATION_MISSING"
        ? Object.freeze({ kind: "missing" }) : rejected(header);
    }
    const headerBinding = currentBinding();
    if (headerBinding.kind !== "missing") return headerBinding;
    const materialization = exactSourceTypeMaterialization(header, matches);
    if (materialization === undefined) return Object.freeze({ kind: "missing" });
    const loaded = loadModule(moduleSpecifier, { ...request, materialization });
    if (isDotnetProviderDiagnostic(loaded)) return rejected(loaded);
    const binding = currentBinding();
    return binding.kind !== "missing" ? binding : rejected(diagnostic(
      "DOTNET_REFLECTION_NATIVE_BINDING_NOT_PROVEN",
      ".NET reflection provider did not prove a complete native target binding.",
      { specifier: moduleSpecifier, ...request },
    ));
  }

  function rememberModule(
    memoryKey: string,
    module: DotnetModuleModel,
    request: DotnetProviderCacheRequest,
  ): DotnetProviderDiagnostic | undefined {
    const bindingDiagnostic = targetBindingIndex.rememberModule(module, request);
    if (bindingDiagnostic !== undefined) {
      diagnostics.set(memoryKey, bindingDiagnostic);
      providerBroker?.writeDiagnostic(request, bindingDiagnostic);
      return bindingDiagnostic;
    }
    modules.set(memoryKey, module);
    return undefined;
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
    context: DotnetProviderDeclarationContext,
    externAlias: NonNullable<ReturnType<typeof parseDotnetModuleSpecifier>>["externAlias"],
  ): DotnetProviderDeclarationContext | DotnetProviderDiagnostic {
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
    value: DotnetProviderDeclarationContext | DotnetProviderDiagnostic,
  ): value is DotnetProviderDiagnostic {
    return "code" in value && "message" in value;
  }
}

function validateProviderStorage(
  storage: DotnetReflectionProviderStorage | undefined,
): DotnetReflectionProviderStorage {
  if (storage === undefined) {
    throw new Error(
      ".NET reflection provider requires explicit caller-owned storage.",
    );
  }
  return Object.freeze({
    toolBuildRoot: requireAbsoluteStoragePath(
      "storage.toolBuildRoot",
      storage.toolBuildRoot,
    ),
    cacheRoot: requireAbsoluteStoragePath(
      "storage.cacheRoot",
      storage.cacheRoot,
    ),
  });
}

function requireAbsoluteStoragePath(name: string, value: string): string {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error(
      `.NET reflection provider ${name} must be an absolute path.`,
    );
  }
  return value;
}

function targetRelationProjectionKey(
  request: DotnetProviderTargetRelationRequest,
): string {
  return JSON.stringify([
    request.moduleSpecifier,
    request.providerModuleId,
    request.exportName,
    request.exportId,
  ]);
}

function exactSourceTypeMaterialization(
  module: DotnetModuleModel,
  matches: (declaration: Extract<DotnetModuleModel["exports"][number], { readonly kind: "type" }>) => boolean,
): ProviderDeclarationMaterialization | undefined {
  const declarations = module.exports.filter((declaration): declaration is Extract<
    DotnetModuleModel["exports"][number],
    { readonly kind: "type" }
  > => declaration.kind === "type" && matches(declaration));
  return declarations.length === 1
    ? exactProviderExportMaterialization(
        declarations[0]!.sourceTypeFamily?.exportName ?? declarations[0]!.sourceName,
        declarations[0]!.targetId,
      )
    : undefined;
}

function exactProviderExportMaterialization(
  exportName: string,
  exportId: string,
): ProviderDeclarationMaterialization {
  return Object.freeze({
    kind: "incremental",
    completeExports: Object.freeze([Object.freeze({ exportName, exportId })]),
  });
}
