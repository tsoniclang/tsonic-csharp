import { relative, resolve } from "node:path";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  SourceFile_FileName,
} from "./source-ast.js";
import {
  isProviderVirtualSourceFile,
} from "./provider-virtual-source-files.js";

interface SourceFileOutputIdentity {
  readonly fileName: string;
  readonly className: string;
  readonly artifactPath: string;
}

const outputIdentityRegistries = new WeakMap<TargetCompileInput, ReadonlyMap<string, SourceFileOutputIdentity>>();

export function validateSourceFileOutputIdentities(
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  const registry = getSourceFileOutputRegistry(input, diagnostics);
  void registry;
}

export function sourceFileClassName(input: TargetCompileInput, fileName: string): string {
  return requireSourceFileOutputIdentity(input, fileName).className;
}

export function sourceFileArtifactPath(input: TargetCompileInput, fileName: string, className: string): string {
  void className;
  return requireSourceFileOutputIdentity(input, fileName).artifactPath;
}

function requireSourceFileOutputIdentity(input: TargetCompileInput, fileName: string): SourceFileOutputIdentity {
  const identity = getSourceFileOutputRegistry(input).get(fileName);
  if (identity === undefined) {
    throw new Error(`Missing C# output identity for source file '${fileName}'. Call validateSourceFileOutputIdentities and stop on diagnostics before planning source files.`);
  }
  return identity;
}

function getSourceFileOutputRegistry(
  input: TargetCompileInput,
  diagnostics?: TargetDiagnostic[],
): ReadonlyMap<string, SourceFileOutputIdentity> {
  const existing = outputIdentityRegistries.get(input);
  if (existing !== undefined) {
    return existing;
  }
  const byFileName = new Map<string, SourceFileOutputIdentity>();
  const byClassName = new Map<string, string>();
  for (const sourceFile of input.sourceFiles) {
    if (sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, sourceFile)) {
      continue;
    }
    const fileName = SourceFile_FileName(sourceFile);
    const relativeName = projectRelativeSourcePath(input, fileName, diagnostics);
    if (relativeName === undefined) {
      continue;
    }
    const suffix = hashString(relativeName);
    const className = `TsonicModule_${suffix}`;
    const artifactPath = `src/modules/${className}.cs`;
    const existingFileName = byClassName.get(className);
    if (existingFileName !== undefined && existingFileName !== fileName) {
      diagnostics?.push({
        code: "CSHARP_SOURCE_IDENTITY_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingFileName}' and '${fileName}' produced the same C# output identity '${className}'.`,
      });
      continue;
    }
    byClassName.set(className, fileName);
    byFileName.set(fileName, { fileName, className, artifactPath });
  }
  outputIdentityRegistries.set(input, byFileName);
  return byFileName;
}

function projectRelativeSourcePath(
  input: TargetCompileInput,
  fileName: string,
  diagnostics?: TargetDiagnostic[],
): string | undefined {
  const projectRoot = normalizePath(resolve(input.paths.projectRoot));
  const absoluteFileName = normalizePath(resolve(fileName));
  const relativeName = normalizePath(relative(projectRoot, absoluteFileName));
  if (relativeName.length === 0 || relativeName === "." || relativeName.startsWith("../") || relativeName === "..") {
    diagnostics?.push({
      code: "CSHARP_SOURCE_OUTSIDE_PROJECT_ROOT",
      category: "error",
      source: "tsonic-csharp",
      message: `Source file '${fileName}' is outside project root '${input.paths.projectRoot}'. C# output identity must be rooted in the project source graph.`,
    });
    return undefined;
  }
  return relativeName;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
