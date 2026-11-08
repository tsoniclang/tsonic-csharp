import {
  rejectedTargetStage,
  resolvedTargetStage,
} from "@tsonic/target-api/artifacts";
import type {
  TargetDiagnostic,
  TargetStageResult,
} from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpOutputPlan } from "../../artifact-model/output.js";
import { planCsharpStartupSourceFile } from "./startup.js";
import { planCsharpSourceRoleFile } from "../objects/source-roles.js";
import { planCsharpNativeDelegateFile } from "../objects/native-delegates.js";
import { planCsharpSourceFiles } from "../artifacts/source-files.js";
import { planCsharpProject } from "../project/project-artifacts.js";
import { preserveCsharpAuthoredNames } from "../../target-ast/normalization/authored-names.js";
import {
  sourceFileArtifactPath,
} from "../artifacts/source-paths.js";
import {
  applyCsharpObjectShapeDisplayNames,
} from "../../target-ast/normalization/object-shape-names.js";
export type CsharpPlanningResult = TargetStageResult<CsharpOutputPlan>;

export function planCsharpOutput(input: CsharpPlanningContext): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = [];
  const reconstructed = planCsharpSourceFiles(
    input,
    diagnostics,
  );
  if (reconstructed === undefined || diagnostics.length > 0) {
    return rejectedTargetStage(diagnostics);
  }
  const plannedSources = reconstructed.sourceFiles;
  const objectShapes = reconstructed.objectShapes;
  const sourceRoles = planCsharpSourceRoleFile(input);
  const nativeDelegates = planCsharpNativeDelegateFile(input);
  const startup = planCsharpStartupSourceFile(
    input,
    plannedSources,
  );
  if (diagnostics.length > 0) {
    return rejectedTargetStage(diagnostics);
  }
  const project = planCsharpProject(input, {
    allowUnsafeBlocks:
      plannedSources.some((source) => source.requiresUnsafe) ||
      objectShapes?.requiresUnsafe === true || sourceRoles?.requiresUnsafe === true || nativeDelegates?.requiresUnsafe === true,
  });
  const sources = [
    ...plannedSources.map((source) => ({
      path: sourceFileArtifactPath(input, source.fileName),
      unit: source.unit,
    })),
    ...(objectShapes === undefined ? [] : [objectShapes.source]),
    ...(sourceRoles === undefined ? [] : [sourceRoles.source]),
    ...(nativeDelegates === undefined ? [] : [nativeDelegates.source]),
    ...(startup === undefined ? [] : [startup]),
  ];
  const normalizedUnits = applyCsharpObjectShapeDisplayNames(
    sources.map((source) => source.unit),
    input.program.records.objectShapeNames.get(),
  );
  const plan: CsharpOutputPlan = Object.freeze({
    project,
    sources: Object.freeze(sources.map((source, index) => Object.freeze({
      ...source,
      unit: preserveCsharpAuthoredNames(normalizedUnits[index]!),
    }))),
  });
  return resolvedTargetStage(plan);
}
