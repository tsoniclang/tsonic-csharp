import { relative, resolve } from "node:path";
import type { AstReader, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  KindClassDeclaration,
  KindEnumDeclaration,
  KindInterfaceDeclaration,
  Node_Name,
  Node_Text,
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
  const byArtifactPath = new Map<string, string>();
  for (const sourceFile of input.sourceFiles) {
    if (sourceFile.IsDeclarationFile || isProviderVirtualSourceFile(input, sourceFile)) {
      continue;
    }
    const fileName = SourceFile_FileName(sourceFile);
    const relativeName = projectRelativeSourcePath(input, fileName, diagnostics);
    if (relativeName === undefined) {
      continue;
    }
    const className = sourceFileModuleClassName(input.ast, relativeName, sourceFile);
    const artifactPath = sourceFileModuleArtifactPath(relativeName, className);
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
    const existingArtifactFileName = byArtifactPath.get(artifactPath);
    if (existingArtifactFileName !== undefined && existingArtifactFileName !== fileName) {
      diagnostics?.push({
        code: "CSHARP_SOURCE_ARTIFACT_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingArtifactFileName}' and '${fileName}' produced the same C# artifact path '${artifactPath}'.`,
      });
      continue;
    }
    byClassName.set(className, fileName);
    byArtifactPath.set(artifactPath, fileName);
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

function sourceFileModuleArtifactPath(relativeName: string, className: string): string {
  const parts = relativeName.split("/");
  parts[parts.length - 1] = `${className}.cs`;
  return `src/${parts.join("/")}`;
}

function sourceFileModuleClassName(ast: AstReader, relativeName: string, sourceFile: SourceFile): string {
  const declarations = getTopLevelTypeDeclarationNames(ast, sourceFile);
  let className = sanitizePascalIdentifier(stripFinalExtension(relativeName).split("/").join("_"), "Module");
  while (declarations.has(className)) {
    className = `${className}Module`;
  }
  return className;
}

function getTopLevelTypeDeclarationNames(ast: AstReader, sourceFile: SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.Statements?.Nodes ?? []) {
    const kind = ast.kindName(statement);
    if (
      kind !== KindClassDeclaration &&
      kind !== KindInterfaceDeclaration &&
      kind !== KindEnumDeclaration
    ) {
      continue;
    }
    const name = Node_Text(Node_Name(statement));
    if (name.length > 0) {
      names.add(sanitizePascalIdentifier(name, name));
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
