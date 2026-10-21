import type {
  CsharpPlanningContext,
} from "../context.js";

import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function sourceFileClassName(
  input: CsharpPlanningContext,
  fileName: string,
): string {
  const selected = input.program.records.sourceFile.get(fileName);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted source file requires its selected native module identity.");
  return selected.className;
}

export function sourceFileArtifactPath(
  input: CsharpPlanningContext,
  fileName: string,
): string {
  const selected = input.program.records.sourceFile.get(fileName);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted source file requires its selected native artifact identity.");
  return `src/${selected.modulePath}.cs`;
}
