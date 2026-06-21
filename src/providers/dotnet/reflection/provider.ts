import { spawnSync } from "node:child_process";
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
  createDotnetModuleSpecifier,
  dotnetModulePrefix,
  parseDotnetModuleSpecifier,
} from "../module-specifier.js";
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
}

export interface DotnetReflectionTypeDataProvider extends DotnetTypeDataProvider {
  findTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined;
}

const providerIdentity: DotnetProviderIdentity = {
  id: "tsonic.csharp.dotnet-reflection-provider",
  version: "0.0.1",
  target: "csharp",
  displayName: "Tsonic C# .NET reflection provider",
};

export function createDotnetReflectionTypeDataProvider(
  options: DotnetReflectionTypeDataProviderOptions = {},
): DotnetReflectionTypeDataProvider {
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  const toolProjectPath = options.toolProjectPath ?? defaultToolProjectPath();
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
    const batchDiagnostic = loadAllModules(context);
    if (batchDiagnostic !== undefined) {
      return batchDiagnostic;
    }
    const loaded = modules.get(specifier);
    if (loaded !== undefined) {
      return loaded;
    }
    const emptyModule: DotnetModuleModel = {
      moduleSpecifier: specifier,
      namespaceName: parsed.namespaceName,
      exports: [],
    };
    modules.set(specifier, emptyModule);
    return emptyModule;
  }

  function loadAllModules(context: DotnetProviderModuleContext): DotnetProviderDiagnostic | undefined {
    if (allModulesLoaded) {
      return undefined;
    }
    const existingDiagnostic = diagnostics.get("*");
    if (existingDiagnostic !== undefined) {
      return existingDiagnostic;
    }
    const args = [
      "run",
      "--project",
      toolProjectPath,
      "--",
      "--all-modules",
      "--module-specifier-prefix",
      dotnetModulePrefix,
    ];
    if (options.referenceDirectory !== undefined) {
      args.push("--reference-dir", options.referenceDirectory);
    }
    for (const reference of [...(context.references ?? []), ...(options.references ?? [])]) {
      args.push("--reference", reference);
    }
    const result = spawnSync("dotnet", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
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
        modules.set(module.moduleSpecifier, module);
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
      for (const namespaceName of namespaceCandidatesFromTargetId(targetId)) {
        const moduleResult = loadModule(createDotnetModuleSpecifier(namespaceName), {});
        if (isDotnetProviderDiagnostic(moduleResult)) {
          continue;
        }
        const binding = findTargetBindingInModule(moduleResult, targetId);
        if (binding !== undefined) {
          return binding;
        }
      }
      return undefined;
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
    if (declaration.kind === "type" && declaration.metadataName === targetId) {
      return dotnetExportToTargetBinding(declaration);
    }
  }
  return undefined;
}

function namespaceCandidatesFromTargetId(targetId: string): readonly string[] {
  const parts = targetId.split(".");
  const candidates: string[] = [];
  for (let count = parts.length - 1; count >= 1; count -= 1) {
    candidates.push(parts.slice(0, count).join("."));
  }
  return candidates;
}

function isDotnetProviderDiagnostic(value: DotnetProviderModuleResult): value is DotnetProviderDiagnostic {
  return "code" in value && "message" in value;
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
