import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";

export function validateSourceFileOutputIdentities(
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): void {
  const plan = input.outputIdentities.prepare();
  if (plan.kind === "rejected") {
    diagnostics.push(...plan.diagnostics);
  }
}

export function sourceFileClassName(
  input: CsharpTranslationContext,
  fileName: string,
): string {
  return input.outputIdentities.resolveRequired(fileName).className;
}

export function sourceFileArtifactPath(
  input: CsharpTranslationContext,
  fileName: string,
): string {
  return input.outputIdentities.resolveRequired(fileName).artifactPath;
}
