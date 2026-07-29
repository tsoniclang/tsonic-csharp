import type { TargetArtifact, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTranslationContext } from "../../translate/context/index.js";
import { materializeCsharpOutputPlan } from "./csharp-output-plan.js";
import { planCsharpEntrypointSourceFile } from "./csharp-entrypoint-planner.js";
import { planCsharpModuleInitialization } from "./csharp-module-initialization.js";
import { planSourceFile } from "./csharp-source-file-planner.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import { planCsharpProject } from "./project-artifacts.js";
import {
  sourceFileArtifactPath,
  validateSourceFileOutputIdentities,
} from "./source-paths.js";
import {
  planCsharpObjectShapeSourceFile,
} from "./object-shapes.js";

export interface CsharpPlanningResult {
  readonly artifacts: readonly TargetArtifact[];
  readonly diagnostics: readonly TargetDiagnostic[];
}

export function planCsharpArtifacts(input: CsharpTranslationContext): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  validateSourceFileOutputIdentities(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const moduleInitialization = planCsharpModuleInitialization(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const plannedSources = planSourceFilesToArtifactFixedPoint(
    input,
    moduleInitialization,
    diagnostics,
  );
  if (plannedSources === undefined || diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const objectShapes = planCsharpObjectShapeSourceFile(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const project = planCsharpProject(input, {
    allowUnsafeBlocks:
      plannedSources.some((source) => source.requiresUnsafe) ||
      objectShapes?.requiresUnsafe === true,
  }, diagnostics);
  if (diagnostics.length > 0 || project === undefined) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
  const artifacts = materializeCsharpOutputPlan({
    project,
    sources: [
      ...plannedSources.map((source) => ({
        path: sourceFileArtifactPath(input, source.fileName),
        unit: source.unit,
      })),
      ...(objectShapes === undefined ? [] : [objectShapes.source]),
      ...[planCsharpEntrypointSourceFile(input, plannedSources, moduleInitialization)].filter((source): source is NonNullable<typeof source> => source !== undefined),
    ],
  });
  return {
    artifacts,
    diagnostics,
  };
}

function planSourceFilesToArtifactFixedPoint(
  input: CsharpTranslationContext,
  moduleInitialization: ReturnType<typeof planCsharpModuleInitialization>,
  diagnostics: TargetDiagnostic[],
): readonly PlannedCsharpSourceFile[] | undefined {
  const maximumPasses = 64;
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    const revision = input.artifacts.revision;
    const passDiagnostics: TargetDiagnostic[] = [];
    const plannedSources: PlannedCsharpSourceFile[] = [];
    for (const sourceFile of input.sourceFiles) {
      const plannedSource = planSourceFile(
        sourceFile,
        input,
        passDiagnostics,
        moduleInitialization,
      );
      if (plannedSource !== undefined) {
        plannedSources.push(plannedSource);
      }
    }
    if (input.artifacts.revision !== revision) {
      continue;
    }
    diagnostics.push(...passDiagnostics);
    return plannedSources;
  }
  diagnostics.push({
    code: "CSHARP_ARTIFACT_FIXED_POINT_EXHAUSTED",
    category: "error",
    source: "tsonic-csharp",
    message:
      "C# target artifact reconstruction did not reach a stable fixed point within 64 complete translation passes.",
  });
  return undefined;
}
