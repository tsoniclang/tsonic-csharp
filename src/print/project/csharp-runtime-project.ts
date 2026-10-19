import type { CsharpRuntimeProjectInstance } from "../../target-model/project/runtime.js";

export function printCsharpRuntimeProject(project: CsharpRuntimeProjectInstance): string {
  return project.text;
}
