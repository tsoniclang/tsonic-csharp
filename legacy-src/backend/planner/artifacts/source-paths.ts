import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function validateSourceFileOutputIdentities(
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): void {
  const plan = input.outputIdentities.prepare();
  if (plan.kind === "rejected") {
    diagnostics.push(...plan.diagnostics);
  }
}

export function sourceFileClassName(
  input: CsharpPlanningContext,
  fileName: string,
): string {
  return input.outputIdentities.resolveRequired(fileName).className;
}

export function sourceFileArtifactPath(
  input: CsharpPlanningContext,
  fileName: string,
): string {
  return input.outputIdentities.resolveRequired(fileName).artifactPath;
}
