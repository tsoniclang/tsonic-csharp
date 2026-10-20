import type { CsharpPlanningContext } from "../context.js";
import type { CsharpProjectFile, CsharpProjectPlan } from "../../../target-model/project/emission.js";
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
} from "../../../target-model/project/emission.js";
export { readNamespace } from "./project-options.js";

export function planCsharpProject(
  input: CsharpPlanningContext,
  options: { readonly allowUnsafeBlocks?: boolean } = {},
): CsharpProjectPlan {
  const project = input.program.records.compilation.get().project.project;
  if (project.kind === "user-owned") {
    return Object.freeze({ kind: "user-owned", projectFile: project.projectFile });
  }
  return Object.freeze({
    kind: "generated",
    project: planCsharpProjectFile(input, options),
  });
}

export function planCsharpProjectFile(
  input: CsharpPlanningContext,
  options: { readonly allowUnsafeBlocks?: boolean } = {},
): CsharpProjectFile {
  const runtimeProjects = input.program.records.compilation.get().project.runtimeProjects;
  return Object.freeze({
    sdk: "Microsoft.NET.Sdk",
    path: `${readAssemblyName(input)}.csproj`,
    properties: Object.freeze(
      readCsharpProjectProperties(input, options).map((property) => Object.freeze(property)),
    ),
    references: Object.freeze(
      [...readReferencesOption(input), ...runtimeProjects.map((project) => ({ kind: "project" as const, include: project.path }))]
        .map((reference) => Object.freeze(reference)),
    ),
    runtimeProjects,
  });
}
