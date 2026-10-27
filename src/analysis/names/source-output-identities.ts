import { relative, resolve } from "node:path";
import { providerVirtualDeclarationFactKey, type AstReader, type Node, type SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetCompilationPaths } from "@tsonic/target-api";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceFileOutputIdentity } from "../../target-model/records/program/source-files.js";
import { createCsharpSourceFileRecords } from "../program/records/program/source-files.js";

export type CsharpSourceOutputIdentityPlan =
  | { readonly kind: "accepted"; readonly identities: ReadonlyMap<string, CsharpSourceFileOutputIdentity> }
  | { readonly kind: "rejected"; readonly diagnostics: readonly TargetDiagnostic[] };

export interface CsharpSourceOutputIdentityPlannerHost {
  readonly namespace: string;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly paths: TargetCompilationPaths;
  readonly generatedTypeNames: readonly string[];
  readonly sourceFacts: TargetSourceProgram["sourceFacts"];
}


export function analyzeCsharpSourceOutputIdentities(host: CsharpSourceOutputIdentityPlannerHost) {
  const providers = new Map<SourceFile, boolean>();
  for (const file of host.sourceFiles) {
    let provider = false;
    const visit = (node: Node): void => {
      if (host.sourceFacts.getFact(node, providerVirtualDeclarationFactKey) !== undefined) provider = true;
      host.ast.forEachChild(node, child => { if (child !== undefined && !provider) visit(child); });
    };
    visit(file);
    providers.set(file, provider);
  }
  const selected = buildSourceOutputIdentityPlan(host, providers);
  return selected.kind === "rejected" ? selected : Object.freeze({
    kind: "accepted" as const, records: createCsharpSourceFileRecords(selected.identities, providers),
  });
}

function buildSourceOutputIdentityPlan(
  host: CsharpSourceOutputIdentityPlannerHost,
  providers: ReadonlyMap<SourceFile, boolean>,
): CsharpSourceOutputIdentityPlan {
  const byFileName = new Map<string, CsharpSourceFileOutputIdentity>();
  const byClassName = new Map<string, string>();
  const byModulePath = new Map<string, string>();
  const diagnostics: TargetDiagnostic[] = [];
  const reservedNames = new Set([...host.generatedTypeNames,
    ...host.sourceFiles.flatMap(sourceFile => [...topLevelTypeNames(host.ast, sourceFile)])]);
  for (const sourceFile of host.sourceFiles) {
    const fileName = host.ast.getFileName(sourceFile);
    if (sourceFile.IsDeclarationFile || providers.get(sourceFile) === true) {
      continue;
    }
    const relativeName = projectRelativeSourcePath(
      host.paths.projectRoot,
      fileName,
      diagnostics,
    );
    if (relativeName === undefined) {
      continue;
    }
    const baseClassName = sourceFileModuleClassName(relativeName);
    const className = allocateSourceFileModuleClassName(
      baseClassName,
      reservedNames,
    );
    const modulePath = sourceFileModulePath(
      relativeName,
      baseClassName,
    );
    const existingFileName = byClassName.get(className);
    if (existingFileName !== undefined && existingFileName !== fileName) {
      diagnostics.push({
        code: "CSHARP_SOURCE_IDENTITY_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingFileName}' and '${fileName}' produced the same deterministic C# output-plan class identity '${className}'.`,
      });
    }
    const existingArtifactFileName = byModulePath.get(modulePath);
    if (
      existingArtifactFileName !== undefined &&
      existingArtifactFileName !== fileName
    ) {
      diagnostics.push({
        code: "CSHARP_SOURCE_ARTIFACT_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingArtifactFileName}' and '${fileName}' produced the same deterministic C# output-plan artifact path 'src/${modulePath}.cs'.`,
      });
    }
    if (
      existingFileName !== undefined ||
      existingArtifactFileName !== undefined
    ) {
      continue;
    }
    byClassName.set(className, fileName);
    byModulePath.set(modulePath, fileName);
    byFileName.set(fileName, Object.freeze({
      fileName,
      namespace: host.namespace,
      className,
      modulePath,
    }));
  }
  return diagnostics.length === 0
    ? {
        kind: "accepted",
        identities: new Map(byFileName),
      }
    : {
        kind: "rejected",
        diagnostics: Object.freeze(diagnostics),
      };
}

function projectRelativeSourcePath(
  projectRootValue: string,
  fileName: string,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const projectRoot = normalizePath(resolve(projectRootValue));
  const absoluteFileName = normalizePath(resolve(fileName));
  const relativeName = normalizePath(relative(projectRoot, absoluteFileName));
  if (
    relativeName.length === 0 ||
    relativeName === "." ||
    relativeName.startsWith("../") ||
    relativeName === ".."
  ) {
    const installedSourcePath = installedSourcePackageRelativePath(
      absoluteFileName,
    );
    if (installedSourcePath !== undefined) {
      return installedSourcePath;
    }
    diagnostics.push({
      code: "CSHARP_SOURCE_OUTSIDE_PROJECT_ROOT",
      category: "error",
      source: "tsonic-csharp",
      message: `Source file '${fileName}' is outside project root '${projectRoot}' and is not an installed source-package file. C# output-plan identity must be rooted in the TSTS project source graph.`,
    });
    return undefined;
  }
  return relativeName;
}

function installedSourcePackageRelativePath(
  absoluteFileName: string,
): string | undefined {
  const marker = "/node_modules/";
  const markerIndex = absoluteFileName.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const packageRelativePath = absoluteFileName.slice(
    markerIndex + marker.length,
  );
  return packageRelativePath.length === 0
    ? undefined
    : `node_modules/${packageRelativePath}`;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function sourceFileModulePath(
  relativeName: string,
  className: string,
): string {
  const parts = relativeName.split("/");
  parts[parts.length - 1] = className;
  return parts.join("/");
}

function sourceFileModuleClassName(relativeName: string): string {
  return sanitizePascalIdentifier(
    stripFinalExtension(relativeName).split("/").join("_"),
    "Module",
  );
}

function allocateSourceFileModuleClassName(
  baseName: string,
  reservedNames: ReadonlySet<string>,
): string {
  if (!reservedNames.has(baseName)) {
    return baseName;
  }
  for (let index = 0; ; index += 1) {
    const candidate = index === 0
      ? `${baseName}Module`
      : `${baseName}Module${index}`;
    if (!reservedNames.has(candidate)) {
      return candidate;
    }
  }
}

function topLevelTypeNames(
  ast: AstReader,
  sourceFile: SourceFile,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of ast.statements(sourceFile)) {
    if (
      statement === undefined ||
      (
        !ast.is.IsClassDeclaration(statement) &&
        !ast.is.IsInterfaceDeclaration(statement) &&
        !ast.is.IsEnumDeclaration(statement)
      )
    ) {
      continue;
    }
    const nameNode = ast.name(statement);
    const name = nameNode === undefined ? "" : ast.text(nameNode);
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

function sanitizePascalIdentifier(
  value: string,
  replacementName: string,
): string {
  const parts = value.split(/[^A-Za-z0-9_]+/).filter(
    (part) => part.length > 0,
  );
  const candidate = parts.map(
    (part) => `${part[0]!.toUpperCase()}${part.slice(1)}`,
  ).join("");
  const prefixed = /^[A-Za-z_]/.test(candidate)
    ? candidate
    : `_${candidate}`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(prefixed)
    ? prefixed
    : replacementName;
}
