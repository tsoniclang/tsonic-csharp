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
  const existing = outputIdentityRegistries.get(input);
  if (existing !== undefined) {
    return;
  }
  const registry = buildSourceFileOutputRegistry(input, diagnostics);
  if (registry !== undefined) {
    outputIdentityRegistries.set(input, registry);
  }
}

export function sourceFileClassName(input: TargetCompileInput, fileName: string): string {
  return requireSourceFileOutputIdentity(input, fileName).className;
}

export function sourceFileArtifactPath(input: TargetCompileInput, fileName: string): string {
  return requireSourceFileOutputIdentity(input, fileName).artifactPath;
}

function requireSourceFileOutputIdentity(input: TargetCompileInput, fileName: string): SourceFileOutputIdentity {
  const registry = outputIdentityRegistries.get(input);
  if (registry === undefined) {
    throw new Error("Missing C# output identity registry. Call validateSourceFileOutputIdentities and stop on diagnostics before planning source files.");
  }
  const identity = registry.get(fileName);
  if (identity === undefined) {
    throw new Error(`Missing C# output identity for source file '${fileName}'. The source file was not part of the validated C# output identity plan.`);
  }
  return identity;
}

function buildSourceFileOutputRegistry(
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): ReadonlyMap<string, SourceFileOutputIdentity> | undefined {
  const byFileName = new Map<string, SourceFileOutputIdentity>();
  const byClassName = new Map<string, string>();
  const byArtifactPath = new Map<string, string>();
  let hasErrors = false;
  for (const sourceFile of input.sourceFiles) {
    if (sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, sourceFile)) {
      continue;
    }
    const fileName = SourceFile_FileName(sourceFile);
    const relativeName = projectRelativeSourcePath(input, fileName, diagnostics);
    if (relativeName === undefined) {
      hasErrors = true;
      continue;
    }
    const baseClassName = sourceFileModuleClassName(relativeName);
    const className = allocateSourceFileModuleClassName(baseClassName, topLevelTypeNames(input, sourceFile));
    const artifactPath = sourceFileModuleArtifactPath(relativeName, baseClassName);
    let hasCollision = false;
    const existingFileName = byClassName.get(className);
    if (existingFileName !== undefined && existingFileName !== fileName) {
      diagnostics.push({
        code: "CSHARP_SOURCE_IDENTITY_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingFileName}' and '${fileName}' produced the same deterministic C# output-plan class identity '${className}'.`,
      });
      hasCollision = true;
    }
    const existingArtifactFileName = byArtifactPath.get(artifactPath);
    if (existingArtifactFileName !== undefined && existingArtifactFileName !== fileName) {
      diagnostics.push({
        code: "CSHARP_SOURCE_ARTIFACT_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingArtifactFileName}' and '${fileName}' produced the same deterministic C# output-plan artifact path '${artifactPath}'.`,
      });
      hasCollision = true;
    }
    if (hasCollision) {
      hasErrors = true;
      continue;
    }
    byClassName.set(className, fileName);
    byArtifactPath.set(artifactPath, fileName);
    byFileName.set(fileName, { fileName, className, artifactPath });
  }
  return hasErrors ? undefined : byFileName;
}

function projectRelativeSourcePath(
  input: TargetCompileInput,
  fileName: string,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const projectRoot = normalizePath(resolve(input.paths.projectRoot));
  const absoluteFileName = normalizePath(resolve(fileName));
  const relativeName = normalizePath(relative(projectRoot, absoluteFileName));
  if (relativeName.length === 0 || relativeName === "." || relativeName.startsWith("../") || relativeName === "..") {
    diagnostics.push({
      code: "CSHARP_SOURCE_OUTSIDE_PROJECT_ROOT",
      category: "error",
      source: "tsonic-csharp",
      message: `Source file '${fileName}' is outside project root '${input.paths.projectRoot}'. C# output-plan identity must be rooted in the TSTS project source graph.`,
    });
    return undefined;
  }
  return relativeName;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function sourceFileModuleArtifactPath(relativeName: string, className: string): string {
  const parts = relativeName.split("/");
  parts[parts.length - 1] = `${className}.cs`;
  return `src/${parts.join("/")}`;
}

function sourceFileModuleClassName(relativeName: string): string {
  return sanitizePascalIdentifier(stripFinalExtension(relativeName).split("/").join("_"), "Module");
}

function allocateSourceFileModuleClassName(
  baseName: string,
  reservedNames: ReadonlySet<string>,
): string {
  if (!reservedNames.has(baseName)) {
    return baseName;
  }
  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? `${baseName}Module` : `${baseName}Module${index}`;
    if (!reservedNames.has(candidate)) {
      return candidate;
    }
  }
}

function topLevelTypeNames(
  input: TargetCompileInput,
  sourceFile: { readonly Statements?: { readonly Nodes?: readonly (unknown | undefined)[] } },
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    if (statement === undefined || typeof statement !== "object") {
      continue;
    }
    const node = statement as Parameters<typeof input.ast.kindName>[0];
    const kind = input.ast.kindName(node);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    const name = input.ast.text(input.ast.name(node));
    if (name.length > 0) {
      names.add(name);
    }
  }
  return names;
}

function stripFinalExtension(value: string): string {
  const lastDot = value.lastIndexOf(".");
  return lastDot < 0 ? value : value.slice(0, lastDot);
}

function sanitizePascalIdentifier(value: string, fallback: string): string {
  const parts = value.split(/[^A-Za-z0-9_]+/).filter((part) => part.length > 0);
  const candidate = parts.map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join("");
  const prefixed = /^[A-Za-z_]/.test(candidate) ? candidate : `_${candidate}`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(prefixed) ? prefixed : fallback;
}
