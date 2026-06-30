import { relative, resolve } from "node:path";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
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

export function planCsharpModuleInitialization(input: TargetCompileInput, diagnostics: TargetDiagnostic[]): CsharpModuleInitializationPlan {
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
  diagnoseRuntimeModuleCycles(input, entries, diagnostics);
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

function diagnoseRuntimeModuleCycles(
  input: TargetCompileInput,
  entries: ReadonlyMap<string, ModuleInitializationEntry>,
  diagnostics: TargetDiagnostic[],
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  for (const fileName of entries.keys()) {
    visitModule(fileName, input, entries, visiting, visited, stack, reportedCycles, diagnostics);
  }
}

function visitModule(
  fileName: string,
  input: TargetCompileInput,
  entries: ReadonlyMap<string, ModuleInitializationEntry>,
  visiting: Set<string>,
  visited: Set<string>,
  stack: string[],
  reportedCycles: Set<string>,
  diagnostics: TargetDiagnostic[],
): void {
  if (visited.has(fileName)) {
    return;
  }
  const activeIndex = stack.indexOf(fileName);
  if (activeIndex >= 0) {
    reportRuntimeModuleCycle(input, stack.slice(activeIndex), fileName, reportedCycles, diagnostics);
    return;
  }
  if (visiting.has(fileName)) {
    return;
  }
  const entry = entries.get(fileName);
  if (entry === undefined) {
    return;
  }
  visiting.add(fileName);
  stack.push(fileName);
  for (const dependency of entry.dependencies) {
    visitModule(normalizedFileName(dependency), input, entries, visiting, visited, stack, reportedCycles, diagnostics);
  }
  stack.pop();
  visiting.delete(fileName);
  visited.add(fileName);
}

function reportRuntimeModuleCycle(
  input: TargetCompileInput,
  cycle: readonly string[],
  closingFileName: string,
  reportedCycles: Set<string>,
  diagnostics: TargetDiagnostic[],
): void {
  const closedCycle = [...cycle, closingFileName];
  const canonicalKey = [...new Set(cycle)].sort().join("\0");
  if (reportedCycles.has(canonicalKey)) {
    return;
  }
  reportedCycles.add(canonicalKey);
  const cycleText = closedCycle.map((fileName) => projectRelativeFileName(input, fileName)).join(" -> ");
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_RUNTIME_MODULE_CYCLE",
    category: "error",
    source: "tsonic-csharp",
    message:
      `Runtime ES module dependency cycle '${cycleText}' cannot be lowered to C# module initialization without finalized live-binding and TDZ support.`,
    evidence: [
      "TSTS selected a runtime project-source import/export dependency cycle.",
      "C# emission must fail closed rather than reading uninitialized default target values.",
      "Implement provider-backed ESM live bindings/TDZ facts before enabling cyclic runtime module graphs.",
    ],
  });
}

function projectRelativeFileName(input: TargetCompileInput, fileName: string): string {
  const projectRoot = normalizedPath(resolve(input.paths.projectRoot));
  const normalizedFileName = normalizedPath(resolve(fileName));
  const relativeName = normalizedPath(relative(projectRoot, normalizedFileName));
  return relativeName.length > 0 && relativeName !== "." && !relativeName.startsWith("../") && relativeName !== ".."
    ? relativeName
    : normalizedFileName;
}
