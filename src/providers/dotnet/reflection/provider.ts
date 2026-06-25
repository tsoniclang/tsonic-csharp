import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  TargetBindingFact,
} from "@tsonic/tsts";
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
import type {
  DotnetReflectionProviderBroker,
} from "./broker.js";
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
  readonly providerBroker?: DotnetReflectionProviderBroker;
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
const providerCacheAbiVersion = "dotnet-reflection-provider-cache-v5";
const supportedTargetFramework = "net10.0";

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions = {},
): DotnetReflectionTypeDataProvider {
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  const targetBindingsByTargetId = new Map<string, TargetBindingFact>();
  const targetBindingsByMetadataName = new Map<string, TargetBindingFact | "ambiguous">();
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
    const targetFrameworkDiagnostic = validateTargetFramework(context);
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
    pushReferenceArgs(args, context);
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
    return {
      providerId: providerIdentity.id,
      providerVersion: providerIdentity.version,
      providerCacheAbiVersion,
      targetFramework: context.targetFramework ?? options.targetFramework ?? supportedTargetFramework,
      moduleSpecifier: specifier,
      namespaceName,
      requestedExports: sortedNonEmpty(context.requestedExports),
      requestedTargetIds: sortedNonEmpty(context.requestedTargetIds),
      requestedMetadataNames: sortedNonEmpty(context.requestedMetadataNames),
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
      const existing = targetBindingsByTargetId.get(targetId);
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
      return findTargetBindingInModule(loaded, targetId);
    },
    findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined {
      telemetry.request("targetBindingByMetadataName");
      const existing = targetBindingsByMetadataName.get(metadataName);
      if (existing !== undefined && existing !== "ambiguous") {
        return existing;
      }
      if (existing === "ambiguous") {
        return undefined;
      }
      const moduleSpecifier = dotnetModuleSpecifierForMetadataName(metadataName);
      if (moduleSpecifier === undefined) {
        return undefined;
      }
      const loaded = loadModule(moduleSpecifier, { requestedMetadataNames: [metadataName] });
      if (isDotnetProviderDiagnostic(loaded)) {
        return undefined;
      }
      return findUniqueTargetBindingByMetadataNameInModule(loaded, metadataName);
    },
    getTelemetrySnapshot(): DotnetProviderTelemetrySnapshot {
      return telemetry.snapshot();
    },
  };

  function rememberModule(memoryKey: string, module: DotnetModuleModel): void {
    modules.set(memoryKey, module);
    rememberModuleTargetBindings(module);
  }

  function rememberModuleTargetBindings(module: DotnetModuleModel): void {
    for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
      if (declaration.kind !== "type") {
        continue;
      }
      const binding = dotnetExportToTargetBinding(declaration);
      if (binding === undefined) {
        continue;
      }
      targetBindingsByTargetId.set(declaration.targetId, binding);
      const existing = targetBindingsByMetadataName.get(declaration.metadataName);
      targetBindingsByMetadataName.set(
        declaration.metadataName,
        existing === undefined || (existing !== "ambiguous" && existing.id === binding.id) ? binding : "ambiguous",
      );
    }
  }

  function validateModuleSatisfiesRequest(
    module: DotnetModuleModel,
    request: DotnetProviderCacheRequest,
  ): DotnetProviderDiagnostic | undefined {
    const missingExports = missingRequestedExports(module, request.requestedExports);
    const missingTargetIds = missingRequestedTargetIds(module, request.requestedTargetIds);
    const missingMetadataNames = missingRequestedMetadataNames(module, request.requestedMetadataNames);
    if (missingExports.length === 0 && missingTargetIds.length === 0 && missingMetadataNames.length === 0) {
      return undefined;
    }
    return diagnostic("DOTNET_REFLECTION_REQUESTED_DECLARATION_MISSING", ".NET reflection provider did not prove all requested declarations.", {
      specifier: request.moduleSpecifier,
      missingExports,
      missingTargetIds,
      missingMetadataNames,
    });
  }
}

function countProviderVirtualDeclarations(model: ProviderDeclarationModel): number {
  return model.exports.reduce((count, declaration) => count + countProviderExportDeclaration(declaration), 0);
}

function countProviderExportDeclaration(declaration: ProviderExportDeclaration): number {
  return 1
    + (declaration.signatures?.length ?? 0)
    + countProviderMemberDeclarations(declaration.members);
}

function countProviderMemberDeclarations(members: readonly ProviderMemberDeclaration[] | undefined): number {
  return (members ?? []).reduce(
    (count, member) => count + 1 + (member.signatures?.length ?? 0),
    0,
  );
}

function isDotnetProviderDiagnostic(value: DotnetProviderModuleResult): value is DotnetProviderDiagnostic {
  return "code" in value && "message" in value;
}

function moduleMemoryCacheKey(request: DotnetProviderCacheRequest): string {
  return JSON.stringify(request);
}

function sortedNonEmpty(values: readonly string[] | undefined): readonly string[] | undefined {
  return values === undefined || values.length === 0 ? undefined : [...new Set(values)].sort();
}

function findTargetBindingInModule(module: DotnetModuleModel, targetId: string): TargetBindingFact | undefined {
  for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
    if (declaration.kind === "type" && declaration.targetId === targetId) {
      return dotnetExportToTargetBinding(declaration);
    }
  }
  return undefined;
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

function missingRequestedExports(
  module: DotnetModuleModel,
  requestedExports: readonly string[] | undefined,
): readonly string[] {
  if (requestedExports === undefined) {
    return [];
  }
  const exports = new Set(module.exports.map((declaration) => declaration.sourceName));
  return requestedExports.filter((exportName) => !exports.has(exportName));
}

function missingRequestedTargetIds(
  module: DotnetModuleModel,
  requestedTargetIds: readonly string[] | undefined,
): readonly string[] {
  if (requestedTargetIds === undefined) {
    return [];
  }
  const targetIds = new Set([...module.exports, ...(module.targetOnlyTypes ?? [])]
    .filter((declaration) => declaration.kind === "type")
    .map((declaration) => declaration.targetId));
  return requestedTargetIds.filter((targetId) => !targetIds.has(targetId));
}

function missingRequestedMetadataNames(
  module: DotnetModuleModel,
  requestedMetadataNames: readonly string[] | undefined,
): readonly string[] {
  if (requestedMetadataNames === undefined) {
    return [];
  }
  const metadataNames = new Set([...module.exports, ...(module.targetOnlyTypes ?? [])]
    .filter((declaration) => declaration.kind === "type")
    .map((declaration) => declaration.metadataName));
  return requestedMetadataNames.filter((metadataName) => !metadataNames.has(metadataName));
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
