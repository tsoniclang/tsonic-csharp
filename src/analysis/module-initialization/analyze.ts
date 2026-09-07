import { relative, resolve } from "node:path";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import {
  AsExpressionStatement,
  AsVariableDeclaration,
  AsVariableStatement,
  KindClassDeclaration,
  KindEmptyStatement,
  KindEnumDeclaration,
  KindExportDeclaration,
  KindFunctionDeclaration,
  KindImportDeclaration,
  KindInterfaceDeclaration,
  KindTypeAliasDeclaration,
  KindVariableStatement,
  SourceFile_FileName,
} from "@tsonic/target-api/source";
import type {
  CsharpAttributeApplicationFactIndex,
} from "../attributes/application-index.js";
import type {
  CsharpSafetyApplicationFactIndex,
} from "../safety/application-index.js";
import type {
  CsharpModuleInitializationAnalysis,
  CsharpModuleInitializationIndex,
  CsharpModuleInitializationIssue,
} from "./model.js";

interface CsharpModuleInitializationAnalysisInput {
  readonly sourceEvidence: import("../source-evidence/model.js").CsharpSourceEvidenceIndex;
  readonly source: TargetSourceProgram;
  readonly sourceFiles: readonly SourceFile[];
  readonly projectRoot: string;
  readonly entryPoint: string;
  readonly attributeApplications: CsharpAttributeApplicationFactIndex;
  readonly safetyApplications: CsharpSafetyApplicationFactIndex;
}

interface ModuleInitializationEntry {
  readonly sourceFile: SourceFile;
  readonly dependencies: readonly SourceFile[];
  readonly directRuntimeEffects: boolean;
}

export function analyzeCsharpModuleInitialization(
  input: CsharpModuleInitializationAnalysisInput,
): CsharpModuleInitializationAnalysis {
  const entries = new Map<string, ModuleInitializationEntry>();
  for (const sourceFile of input.sourceFiles) {
    entries.set(normalizedFileName(input, sourceFile), Object.freeze({
      sourceFile,
      dependencies: Object.freeze(input.source.navigation
        .moduleDependencies(sourceFile)
        .map((dependency) => dependency.sourceFile)),
      directRuntimeEffects: sourceFileHasDirectRuntimeEffects(sourceFile, input),
    }));
  }
  const issues = diagnoseRuntimeModuleCycles(input, entries);
  const requiredByFile = new Map<string, boolean>();
  const asyncByFile = new Map<string, boolean>();
  for (const fileName of entries.keys()) {
    moduleRequiresInitialization(fileName, input, entries, requiredByFile, new Set());
    moduleRequiresAsyncInitialization(fileName, input, entries, asyncByFile, new Set());
  }
  const dependenciesByFile = new Map<string, readonly SourceFile[]>();
  for (const [fileName, entry] of entries) {
    dependenciesByFile.set(fileName, Object.freeze(entry.dependencies.filter(
      (dependency) => requiredByFile.get(normalizedFileName(input, dependency)) === true,
    )));
  }
  const entrypointFileName = normalizedPath(resolve(
    input.projectRoot,
    input.entryPoint,
  ));
  const index: CsharpModuleInitializationIndex = Object.freeze({
    dependenciesFor(sourceFile: SourceFile) {
      return dependenciesByFile.get(normalizedFileName(input, sourceFile)) ?? emptySourceFiles;
    },
    requiresInitializer(sourceFile: SourceFile) {
      return requiredByFile.get(normalizedFileName(input, sourceFile)) === true;
    },
    isAsync(sourceFile: SourceFile) {
      return asyncByFile.get(normalizedFileName(input, sourceFile)) === true;
    },
    entrypointInitializer() {
      return entries.get(entrypointFileName)?.sourceFile;
    },
  });
  return Object.freeze({
    index,
    issues: Object.freeze(issues),
  });
}

function sourceFileHasDirectRuntimeEffects(
  sourceFile: SourceFile,
  input: CsharpModuleInitializationAnalysisInput,
): boolean {
  for (const statement of input.source.ast.statements(sourceFile)) {
    if (statement === undefined) {
      return true;
    }
    if (isErasedCompileTimeStatement(statement, input)) {
      continue;
    }
    switch (input.source.ast.kindName(statement)) {
      case KindImportDeclaration:
      case KindTypeAliasDeclaration:
      case KindExportDeclaration:
      case KindInterfaceDeclaration:
      case KindEnumDeclaration:
      case KindFunctionDeclaration:
      case KindClassDeclaration:
      case KindEmptyStatement:
        continue;
      case KindVariableStatement:
        if (variableStatementHasInitializer(statement, input)) {
          return true;
        }
        continue;
      default:
        return true;
    }
  }
  return false;
}

function isErasedCompileTimeStatement(
  statement: Node,
  input: CsharpModuleInitializationAnalysisInput,
): boolean {
  const expression = AsExpressionStatement(input.source.ast, statement)?.Expression;
  if (expression === undefined) {
    return false;
  }
  if (input.sourceEvidence.isCompileTimeMetadata(expression)) return true;
  if (input.attributeApplications.forSubject(expression) !== undefined) {
    return true;
  }
  const safety = input.safetyApplications.operationForSubject(expression);
  return safety?.kind === "safety-builder" ||
    safety?.kind === "unsafe-context" && safety.fact.kind === "remaining-block";
}

function variableStatementHasInitializer(
  statement: Node,
  input: CsharpModuleInitializationAnalysisInput,
): boolean {
  const declarationList = AsVariableStatement(
    input.source.ast,
    statement,
  )?.DeclarationList;
  if (declarationList === undefined) {
    return true;
  }
  return input.source.ast.children(declarationList).some((node) =>
    node !== undefined &&
    input.source.ast.is.IsVariableDeclaration(node) &&
    !input.sourceEvidence.isCompileTimeMetadata(node) &&
    AsVariableDeclaration(input.source.ast, node)?.Initializer !== undefined);
}

function moduleRequiresInitialization(
  fileName: string,
  input: CsharpModuleInitializationAnalysisInput,
  entries: ReadonlyMap<string, ModuleInitializationEntry>,
  cache: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const cached = cache.get(fileName);
  if (cached !== undefined) {
    return cached;
  }
  const entry = entries.get(fileName);
  if (entry === undefined || visiting.has(fileName)) {
    return false;
  }
  visiting.add(fileName);
  const required = entry.directRuntimeEffects || entry.dependencies.some(
    (dependency) => moduleRequiresInitialization(
      normalizedFileName(input, dependency),
      input,
      entries,
      cache,
      visiting,
    ),
  );
  visiting.delete(fileName);
  cache.set(fileName, required);
  return required;
}

function moduleRequiresAsyncInitialization(
  fileName: string,
  input: CsharpModuleInitializationAnalysisInput,
  entries: ReadonlyMap<string, ModuleInitializationEntry>,
  cache: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const cached = cache.get(fileName);
  if (cached !== undefined) {
    return cached;
  }
  const entry = entries.get(fileName);
  if (entry === undefined || visiting.has(fileName)) {
    return false;
  }
  visiting.add(fileName);
  const async = input.source.navigation.moduleHasTopLevelAwait(entry.sourceFile) ||
    entry.dependencies.some((dependency) => moduleRequiresAsyncInitialization(
      normalizedFileName(input, dependency),
      input,
      entries,
      cache,
      visiting,
    ));
  visiting.delete(fileName);
  cache.set(fileName, async);
  return async;
}

function diagnoseRuntimeModuleCycles(
  input: CsharpModuleInitializationAnalysisInput,
  entries: ReadonlyMap<string, ModuleInitializationEntry>,
): CsharpModuleInitializationIssue[] {
  const issues: CsharpModuleInitializationIssue[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  for (const fileName of entries.keys()) {
    visitModule(
      fileName,
      input,
      entries,
      visiting,
      visited,
      stack,
      reportedCycles,
      issues,
    );
  }
  return issues;
}

function visitModule(
  fileName: string,
  input: CsharpModuleInitializationAnalysisInput,
  entries: ReadonlyMap<string, ModuleInitializationEntry>,
  visiting: Set<string>,
  visited: Set<string>,
  stack: string[],
  reportedCycles: Set<string>,
  issues: CsharpModuleInitializationIssue[],
): void {
  if (visited.has(fileName)) {
    return;
  }
  const activeIndex = stack.indexOf(fileName);
  if (activeIndex >= 0) {
    reportRuntimeModuleCycle(
      input,
      stack.slice(activeIndex),
      fileName,
      reportedCycles,
      issues,
    );
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
    visitModule(
      normalizedFileName(input, dependency),
      input,
      entries,
      visiting,
      visited,
      stack,
      reportedCycles,
      issues,
    );
  }
  stack.pop();
  visiting.delete(fileName);
  visited.add(fileName);
}

function reportRuntimeModuleCycle(
  input: CsharpModuleInitializationAnalysisInput,
  cycle: readonly string[],
  closingFileName: string,
  reportedCycles: Set<string>,
  issues: CsharpModuleInitializationIssue[],
): void {
  const canonicalKey = [...new Set(cycle)].sort().join("\0");
  if (reportedCycles.has(canonicalKey)) {
    return;
  }
  reportedCycles.add(canonicalKey);
  const cycleText = [...cycle, closingFileName]
    .map((fileName) => projectRelativeFileName(input.projectRoot, fileName))
    .join(" -> ");
  issues.push(Object.freeze({
    code: "CSHARP_UNSUPPORTED_RUNTIME_MODULE_CYCLE",
    message:
      `Runtime ES module dependency cycle '${cycleText}' cannot be lowered to C# module initialization without finalized live-binding and TDZ support.`,
    evidence: Object.freeze([
      "TSTS selected a runtime project-source import/export dependency cycle.",
      "C# emission must fail closed rather than reading uninitialized default target values.",
      "Implement provider-backed ESM live bindings/TDZ facts before enabling cyclic runtime module graphs.",
    ]),
  }));
}

function normalizedFileName(
  input: CsharpModuleInitializationAnalysisInput,
  sourceFile: SourceFile,
): string {
  return normalizedPath(SourceFile_FileName(input.source.ast, sourceFile));
}

function normalizedPath(path: string): string {
  return path.split("\\").join("/");
}

function projectRelativeFileName(projectRoot: string, fileName: string): string {
  const normalizedProjectRoot = normalizedPath(resolve(projectRoot));
  const normalizedFileName = normalizedPath(resolve(fileName));
  const relativeName = normalizedPath(relative(normalizedProjectRoot, normalizedFileName));
  return relativeName.length > 0 && relativeName !== "." &&
      !relativeName.startsWith("../") && relativeName !== ".."
    ? relativeName
    : normalizedFileName;
}

const emptySourceFiles: readonly SourceFile[] = Object.freeze([]);
