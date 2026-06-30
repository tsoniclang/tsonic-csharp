import type { TargetArtifact, TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { materializeCsharpOutputPlan } from "./csharp-output-plan.js";
import { planCsharpEntrypointSourceFile } from "./csharp-entrypoint-planner.js";
import { planCsharpModuleInitialization } from "./csharp-module-initialization.js";
import { planSourceFile } from "./csharp-source-file-planner.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import { planCsharpProjectFile } from "./project-artifacts.js";
import {
  sourceFileArtifactPath,
  validateSourceFileOutputIdentities,
} from "./source-paths.js";

export interface CsharpPlanningResult {
  readonly artifacts: readonly TargetArtifact[];
  readonly diagnostics: readonly TargetDiagnostic[];
}

export function planCsharpArtifacts(input: TargetCompileInput): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  validateSourceFileOutputIdentities(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const plannedSources: PlannedCsharpSourceFile[] = [];
  const moduleInitialization = planCsharpModuleInitialization(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  for (const sourceFile of input.sourceFiles) {
    const plannedSource = planSourceFile(sourceFile, input, diagnostics, moduleInitialization);
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
    sources: [
      ...plannedSources.map((source) => ({
        path: sourceFileArtifactPath(input, source.fileName),
        unit: source.unit,
      })),
      ...[planCsharpEntrypointSourceFile(input, plannedSources, moduleInitialization)].filter((source): source is NonNullable<typeof source> => source !== undefined),
    ],
  });
  return {
    artifacts,
    diagnostics,
  };
}
