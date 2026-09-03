import {
  rejectedTargetStage,
  resolvedTargetStage,
} from "@tsonic/target-api/artifacts";
import type {
  TargetDiagnostic,
  TargetStageResult,
} from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "./context.js";
import type { CsharpOutputPlan } from "../artifact-model/output.js";
import { planCsharpStartupSourceFile } from "./program/startup.js";
import { reconstructCsharpSourceFiles } from "./artifacts/source-file-reconstruction.js";
import { planCsharpProject } from "./project/project-artifacts.js";
import {
  sourceFileArtifactPath,
  validateSourceFileOutputIdentities,
} from "./artifacts/source-paths.js";
import {
  planCsharpObjectShapeSourceFile,
} from "./objects/index.js";
import {
  planCsharpGeneratedHelperSourceFile,
} from "./artifacts/generated-helper-source.js";
import {
  applyCsharpObjectShapeDisplayNames,
} from "../target-ast/normalization/object-shape-names.js";
import {
  csharpObjectShapeNameCandidates,
} from "./objects/display-names.js";
export type CsharpPlanningResult = TargetStageResult<CsharpOutputPlan>;

export function planCsharpOutput(input: CsharpPlanningContext): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  validateSourceFileOutputIdentities(input, diagnostics);
  if (diagnostics.length > 0) {
    return rejectedTargetStage(diagnostics);
  }
  const moduleInitialization = input.program.moduleInitialization;
  const plannedSources = reconstructCsharpSourceFiles(
    input,
    moduleInitialization,
    diagnostics,
  );
  if (plannedSources === undefined || diagnostics.length > 0) {
    return rejectedTargetStage(diagnostics);
  }
  const objectShapes = planCsharpObjectShapeSourceFile(input, diagnostics);
  if (diagnostics.length > 0) {
    return rejectedTargetStage(diagnostics);
  }
  const generatedHelpers = planCsharpGeneratedHelperSourceFile(input);
  const startup = planCsharpStartupSourceFile(
    input,
    plannedSources,
    moduleInitialization,
    diagnostics,
  );
  if (diagnostics.length > 0) {
    return rejectedTargetStage(diagnostics);
  }
  const project = planCsharpProject(input, {
    allowUnsafeBlocks:
      plannedSources.some((source) => source.requiresUnsafe) ||
      objectShapes?.requiresUnsafe === true,
  });
  const sources = [
    ...plannedSources.map((source) => ({
      path: sourceFileArtifactPath(input, source.fileName),
      unit: source.unit,
    })),
    ...(objectShapes === undefined ? [] : [objectShapes.source]),
    ...(generatedHelpers === undefined ? [] : [generatedHelpers]),
    ...(startup === undefined ? [] : [startup]),
  ];
  const normalizedUnits = applyCsharpObjectShapeDisplayNames(
    sources.map((source) => source.unit),
    csharpObjectShapeNameCandidates(input.artifacts.objectShapeArtifacts()),
  );
  const plan: CsharpOutputPlan = Object.freeze({
    project,
    sources: Object.freeze(sources.map((source, index) => Object.freeze({
      ...source,
      unit: normalizedUnits[index]!,
    }))),
  });
  return resolvedTargetStage(plan);
}
