import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
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
  dotnetModulePrefix,
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

export interface DotnetReflectionTypeDataProviderOptions {
  readonly toolProjectPath?: string;
  readonly referenceDirectory?: string;
  readonly references?: readonly string[];
  readonly targetFramework?: string;
  readonly toolBuildRoot?: string;
}

export interface DotnetReflectionTypeDataProvider extends DotnetTypeDataProvider {
  findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined;
  findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined;
}

const providerIdentity: DotnetProviderIdentity = {
  id: "tsonic.csharp.dotnet-reflection-provider",
  version: "0.0.1",
  target: "csharp",
  displayName: "Tsonic C# .NET reflection provider",
};
const supportedTargetFramework = "net10.0";
let nextProviderToolRunId = 1;

interface DotnetProviderToolResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions = {},
): DotnetReflectionTypeDataProvider {
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  const toolProjectPath = options.toolProjectPath ?? defaultToolProjectPath();
  const toolBuildRoot = options.toolBuildRoot ?? defaultToolBuildRoot(nextDotnetProviderToolRunId());
  let allModulesLoaded = false;

  function loadModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult {
    const existing = modules.get(specifier);
    if (existing !== undefined) {
      return existing;
    }
    const existingDiagnostic = diagnostics.get(specifier);
    if (existingDiagnostic !== undefined) {
      return existingDiagnostic;
    }
    const parsed = parseDotnetModuleSpecifier(specifier);
    if (parsed === undefined) {
      return diagnostic("DOTNET_REFLECTION_SPECIFIER_INVALID", `.NET reflection provider does not own '${specifier}'.`, { specifier });
    }
    return loadSingleModule(specifier, parsed.namespaceName, context);
  }

  function loadSingleModule(
    specifier: string,
    namespaceName: string,
    context: DotnetProviderModuleContext,
  ): DotnetProviderModuleResult {
    const targetFrameworkDiagnostic = validateTargetFramework(context);
    if (targetFrameworkDiagnostic !== undefined) {
      return targetFrameworkDiagnostic;
    }
    const args = [
      "run",
      "--project",
      toolProjectPath,
      `-p:BaseIntermediateOutputPath=${join(toolBuildRoot, "obj/")}`,
      `-p:BaseOutputPath=${join(toolBuildRoot, "bin/")}`,
      "--",
      "--namespace",
      namespaceName,
      "--module-specifier",
      specifier,
    ];
    pushReferenceArgs(args, context);
    const result = runDotnetProviderTool(args);
    if (result.status !== 0) {
      const error = diagnostic("DOTNET_REFLECTION_PROVIDER_FAILED", ".NET reflection provider tool failed.", {
        specifier,
        status: result.status,
        stderr: result.stderr,
      });
      diagnostics.set(specifier, error);
      return error;
    }
    try {
      const module = augmentDotnetModuleWithNativeArray(JSON.parse(result.stdout) as DotnetModuleModel);
      modules.set(specifier, module);
      return module;
    } catch (error) {
      const parseError = diagnostic("DOTNET_REFLECTION_PROVIDER_INVALID_JSON", ".NET reflection provider emitted invalid JSON.", {
        specifier,
        error: error instanceof Error ? error.message : String(error),
      });
      diagnostics.set(specifier, parseError);
      return parseError;
    }
  }

  function loadAllModules(context: DotnetProviderModuleContext): DotnetProviderDiagnostic | undefined {
    if (allModulesLoaded) {
      return undefined;
    }
    const existingDiagnostic = diagnostics.get("*");
    if (existingDiagnostic !== undefined) {
      return existingDiagnostic;
    }
    const targetFrameworkDiagnostic = validateTargetFramework(context);
    if (targetFrameworkDiagnostic !== undefined) {
      diagnostics.set("*", targetFrameworkDiagnostic);
      return targetFrameworkDiagnostic;
    }
    const args = [
      "run",
      "--project",
      toolProjectPath,
      `-p:BaseIntermediateOutputPath=${join(toolBuildRoot, "obj/")}`,
      `-p:BaseOutputPath=${join(toolBuildRoot, "bin/")}`,
      "--",
      "--all-modules",
      "--module-specifier-prefix",
      dotnetModulePrefix,
    ];
    pushReferenceArgs(args, context);
    const result = runDotnetProviderTool(args);
    if (result.status !== 0) {
      const error = diagnostic("DOTNET_REFLECTION_PROVIDER_FAILED", ".NET reflection provider tool failed.", {
        specifier: "*",
        status: result.status,
        stderr: result.stderr,
      });
      diagnostics.set("*", error);
      return error;
    }
    try {
      const loadedModules = JSON.parse(result.stdout) as DotnetModuleModel[];
      for (const module of loadedModules) {
        modules.set(module.moduleSpecifier, augmentDotnetModuleWithNativeArray(module));
      }
      allModulesLoaded = true;
      return undefined;
    } catch (error) {
      const parseError = diagnostic("DOTNET_REFLECTION_PROVIDER_INVALID_JSON", ".NET reflection provider emitted invalid JSON.", {
        specifier: "*",
        error: error instanceof Error ? error.message : String(error),
      });
      diagnostics.set("*", parseError);
      return parseError;
    }
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

  function runDotnetProviderTool(args: readonly string[]): DotnetProviderToolResult {
    const result = spawnSync("dotnet", args, {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
    });
    return {
      status: result.status,
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    };
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
      const batchDiagnostic = loadAllModules({});
      if (batchDiagnostic !== undefined) {
        return undefined;
      }
      return findTargetBindingInLoadedModules(modules, targetId);
    },
    findTargetBindingByMetadataName(metadataName: string): TargetBindingFact | undefined {
      const existing = findUniqueTargetBindingByMetadataNameInLoadedModules(modules, metadataName);
      if (existing !== undefined) {
        return existing;
      }
      const batchDiagnostic = loadAllModules({});
      if (batchDiagnostic !== undefined) {
        return undefined;
      }
      return findUniqueTargetBindingByMetadataNameInLoadedModules(modules, metadataName);
    },
  };
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

function defaultToolBuildRoot(runId: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.temp/dotnet-type-provider", runId);
}

function nextDotnetProviderToolRunId(): string {
  const id = nextProviderToolRunId;
  nextProviderToolRunId += 1;
  return `${process.pid}-${id}`;
}
