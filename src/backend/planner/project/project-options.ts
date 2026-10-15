import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpProjectProperty,
} from "../../../target-model/project/model.js";
import type {
  CsharpProjectReference,
} from "../../../target-model/project/references.js";

export function readCsharpProjectProperties(
  input: CsharpPlanningContext,
  options: { readonly allowUnsafeBlocks?: boolean },
): readonly CsharpProjectProperty[] {
  return options.allowUnsafeBlocks === true
    ? Object.freeze([
        ...input.program.project.properties,
        Object.freeze({ name: "AllowUnsafeBlocks", value: "true" }),
      ])
    : input.program.project.properties;
}

export function readReferencesOption(
  input: CsharpPlanningContext,
): readonly CsharpProjectReference[] {
  return input.program.project.references;
}

export function readNamespace(input: CsharpPlanningContext): string {
  return input.program.project.namespace;
}

export function readAssemblyName(input: CsharpPlanningContext): string {
  return input.program.project.assemblyName;
}
