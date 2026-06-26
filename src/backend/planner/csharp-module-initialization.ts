import { resolve } from "node:path";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import { readCsharpOutputType } from "../../options/csharp-target-options.js";
import {
  SourceFile_FileName,
} from "./source-ast.js";

export interface CsharpModuleInitializationPlan {
  readonly dependenciesFor: (sourceFile: SourceFile) => readonly SourceFile[];
  readonly requiresInitializer: (sourceFile: SourceFile) => boolean;
  readonly entrypointInitializer: () => SourceFile | undefined;
}

interface ModuleInitializationEntry {
  readonly sourceFile: SourceFile;
  readonly dependencies: readonly SourceFile[];
  readonly required: boolean;
}

export function planCsharpModuleInitialization(input: TargetCompileInput): CsharpModuleInitializationPlan {
  const entries = new Map<string, ModuleInitializationEntry>();
  const runtimeImportTargets = new Set<string>();
  for (const sourceFile of input.sourceFiles) {
    const dependencies = input.analysis.getProjectSourceModuleDependencies(sourceFile)
      .map((dependency) => dependency.sourceFile);
    for (const dependency of dependencies) {
      runtimeImportTargets.add(normalizedFileName(dependency));
    }
    entries.set(normalizedFileName(sourceFile), {
      sourceFile,
      dependencies,
      required: dependencies.length > 0,
    });
  }
  const entrypointFileName = normalizedPath(resolve(input.paths.projectRoot, input.project.entryPoint));
  const entrypointRequiresInitializer = readCsharpOutputType(input.target) === "Exe";
  return {
    dependenciesFor(sourceFile) {
      return entries.get(normalizedFileName(sourceFile))?.dependencies ?? [];
    },
    requiresInitializer(sourceFile) {
      const fileName = normalizedFileName(sourceFile);
      return (entrypointRequiresInitializer && fileName === entrypointFileName) ||
        runtimeImportTargets.has(fileName) ||
        entries.get(fileName)?.required === true;
    },
    entrypointInitializer() {
      return entries.get(entrypointFileName)?.sourceFile;
    },
  };
}

function normalizedFileName(sourceFile: SourceFile): string {
  return normalizedPath(SourceFile_FileName(sourceFile));
}

function normalizedPath(path: string): string {
  return path.split("\\").join("/");
}
