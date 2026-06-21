import type { TargetArtifact, TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { materializeCsharpOutputPlan } from "./csharp-output-plan.js";
import { planSourceFile } from "./csharp-source-file-planner.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import { planCsharpProjectFile } from "./project-artifacts.js";
import { sourceFileArtifactPath } from "./source-paths.js";

export interface CsharpPlanningResult {
  readonly artifacts: readonly TargetArtifact[];
  readonly diagnostics: readonly TargetDiagnostic[];
}

export function planCsharpArtifacts(input: TargetCompileInput): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  const plannedSources: PlannedCsharpSourceFile[] = [];
  for (const sourceFile of input.sourceFiles) {
    const plannedSource = planSourceFile(sourceFile, input, diagnostics);
    if (plannedSource !== undefined) {
      plannedSources.push(plannedSource);
    }
  }
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const artifacts = materializeCsharpOutputPlan({
    project: planCsharpProjectFile(input, {
      allowUnsafeBlocks: plannedSources.some((source) => source.requiresUnsafe),
    }),
    sources: plannedSources.map((source) => ({
      path: sourceFileArtifactPath(input, source.fileName, source.moduleClassName),
      unit: source.unit,
    })),
  });
  return {
    artifacts,
    diagnostics,
  };
}
