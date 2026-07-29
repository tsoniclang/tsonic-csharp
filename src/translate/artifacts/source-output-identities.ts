import { relative, resolve } from "node:path";
import type {
  AstReader,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompilationPaths,
  TargetDiagnostic,
} from "@tsonic/target-api";

export interface CsharpSourceFileOutputIdentity {
  readonly fileName: string;
  readonly className: string;
  readonly artifactPath: string;
}

export type CsharpSourceOutputIdentityPlan =
  | {
      readonly kind: "accepted";
      readonly identities: ReadonlyMap<string, CsharpSourceFileOutputIdentity>;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostics: readonly TargetDiagnostic[];
    };

export interface CsharpSourceOutputIdentityPlanner {
  prepare(): CsharpSourceOutputIdentityPlan;
  require(fileName: string): CsharpSourceFileOutputIdentity;
}

export interface CsharpSourceOutputIdentityPlannerHost {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly paths: TargetCompilationPaths;
}

export function createCsharpSourceOutputIdentityPlanner(
  host: CsharpSourceOutputIdentityPlannerHost,
): CsharpSourceOutputIdentityPlanner {
  let prepared: CsharpSourceOutputIdentityPlan | undefined;

  function prepare(): CsharpSourceOutputIdentityPlan {
    prepared ??= buildSourceOutputIdentityPlan(host);
    return prepared;
  }

  function require(fileName: string): CsharpSourceFileOutputIdentity {
    const plan = prepare();
    if (plan.kind === "rejected") {
      throw new Error(
        "C# source output identities are unavailable because deterministic identity validation failed.",
      );
    }
    const identity = plan.identities.get(fileName);
    if (identity === undefined) {
      throw new Error(
        `Missing C# output identity for source file '${fileName}'. The source file was not part of the checked C# output plan.`,
      );
    }
    return identity;
  }

  return Object.freeze({ prepare, require });
}

function buildSourceOutputIdentityPlan(
  host: CsharpSourceOutputIdentityPlannerHost,
): CsharpSourceOutputIdentityPlan {
  const byFileName = new Map<string, CsharpSourceFileOutputIdentity>();
  const byClassName = new Map<string, string>();
  const byArtifactPath = new Map<string, string>();
  const diagnostics: TargetDiagnostic[] = [];
  for (const sourceFile of host.sourceFiles) {
    const fileName = host.ast.getFileName(sourceFile);
    if (sourceFile.IsDeclarationFile || fileName.startsWith("tsts-provider://")) {
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
      topLevelTypeNames(host.ast, sourceFile),
    );
    const artifactPath = sourceFileModuleArtifactPath(
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
    const existingArtifactFileName = byArtifactPath.get(artifactPath);
    if (
      existingArtifactFileName !== undefined &&
      existingArtifactFileName !== fileName
    ) {
      diagnostics.push({
        code: "CSHARP_SOURCE_ARTIFACT_COLLISION",
        category: "error",
        source: "tsonic-csharp",
        message: `Source files '${existingArtifactFileName}' and '${fileName}' produced the same deterministic C# output-plan artifact path '${artifactPath}'.`,
      });
    }
    if (
      existingFileName !== undefined ||
      existingArtifactFileName !== undefined
    ) {
      continue;
    }
    byClassName.set(className, fileName);
    byArtifactPath.set(artifactPath, fileName);
    byFileName.set(fileName, Object.freeze({
      fileName,
      className,
      artifactPath,
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

function sourceFileModuleArtifactPath(
  relativeName: string,
  className: string,
): string {
  const parts = relativeName.split("/");
  parts[parts.length - 1] = `${className}.cs`;
  return `src/${parts.join("/")}`;
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
