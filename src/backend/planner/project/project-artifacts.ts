import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { existsSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { CsharpProjectFile, CsharpProjectPlan } from "../../project-model/csharp-project.js";
import {
  readCsharpUserProjectFile,
  validateCsharpTargetOptions,
} from "../../../options/csharp-target-options.js";
import {
  readAssemblyName,
  readCsharpProjectProperties,
  readReferencesOption,
} from "./project-options.js";

export type {
  CsharpProjectFile,
  CsharpProjectPlan,
  CsharpProjectProperty,
  CsharpProjectReference,
} from "../../project-model/csharp-project.js";
export { readNamespace } from "./project-options.js";

export function planCsharpProject(
  input: CsharpPlanningContext,
  options: { readonly allowUnsafeBlocks?: boolean } = {},
  diagnostics?: TargetDiagnostic[],
): CsharpProjectPlan | undefined {
  validateCsharpTargetOptions(input.target);
  const userProjectFile = readCsharpUserProjectFile(input.target);
  if (userProjectFile !== undefined) {
    const projectFile = resolveUserProjectFile(input, userProjectFile, diagnostics);
    return projectFile === undefined
      ? undefined
      : { kind: "user-owned", projectFile };
  }
  return {
    kind: "generated",
    project: planCsharpProjectFile(input, options),
  };
}

export function planCsharpProjectFile(
  input: CsharpPlanningContext,
  options: { readonly allowUnsafeBlocks?: boolean } = {},
): CsharpProjectFile {
  validateCsharpTargetOptions(input.target);
  return {
    sdk: "Microsoft.NET.Sdk",
    path: `${readAssemblyName(input)}.csproj`,
    properties: readCsharpProjectProperties(input, options),
    references: readReferencesOption(input),
  };
}

function resolveUserProjectFile(
  input: CsharpPlanningContext,
  projectFile: string,
  diagnostics: TargetDiagnostic[] | undefined,
): string | undefined {
  const resolved = isAbsolute(projectFile)
    ? resolve(projectFile)
    : resolve(dirname(input.paths.projectFilePath), projectFile);
  const diagnostic = validateUserProjectFile(input, resolved);
  if (diagnostic !== undefined) {
    diagnostics?.push(diagnostic);
    if (diagnostics === undefined) {
      throw new Error(diagnostic.message);
    }
    return undefined;
  }
  return resolved;
}

function validateUserProjectFile(
  input: CsharpPlanningContext,
  projectFile: string,
): TargetDiagnostic | undefined {
  if (extname(projectFile) !== ".csproj") {
    return userProjectDiagnostic(
      `C# target option 'projectFile' must point to a .csproj file: ${projectFile}`,
      projectFile,
      "The C# target treats advanced .NET build/toolchain configuration as user-owned MSBuild configuration.",
    );
  }
  if (!existsSync(projectFile)) {
    return userProjectDiagnostic(
      `C# target option 'projectFile' does not exist: ${projectFile}`,
      projectFile,
      "Tsonic emits generated C# source for user-owned project mode but does not create or mutate the user project file.",
    );
  }
  if (!statSync(projectFile).isFile()) {
    return userProjectDiagnostic(
      `C# target option 'projectFile' must point to a file: ${projectFile}`,
      projectFile,
      "Tsonic emits generated C# source for user-owned project mode but does not create or mutate the user project file.",
    );
  }
  const relativeToTargetOutput = normalizePath(relative(resolve(input.paths.targetOutputRoot), projectFile));
  if (relativeToTargetOutput.length === 0 || relativeToTargetOutput === "." || (!relativeToTargetOutput.startsWith("../") && relativeToTargetOutput !== "..")) {
    return userProjectDiagnostic(
      `C# target option 'projectFile' must not point inside generated target output root '${input.paths.targetOutputRoot}': ${projectFile}`,
      projectFile,
      "User-owned project mode must not let generated output own or overwrite the project file that controls the target toolchain.",
    );
  }
  return undefined;
}

function userProjectDiagnostic(
  message: string,
  projectFile: string,
  evidence: string,
): TargetDiagnostic {
  return {
    code: "CSHARP_USER_PROJECT_INVALID",
    category: "error",
    source: "tsonic-csharp",
    message,
    evidence: [
      `projectFile: ${projectFile}`,
      evidence,
    ],
  };
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}
