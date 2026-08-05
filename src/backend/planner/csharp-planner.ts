import type { TargetArtifact, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTranslationContext } from "../../translate/context/index.js";
import { materializeCsharpOutputPlan } from "./csharp-output-plan.js";
import { planCsharpStartupSourceFile } from "./csharp-startup-planner.js";
import { planCsharpModuleInitialization } from "./csharp-module-initialization.js";
import { reconstructCsharpSourceFiles } from "./source-file-reconstruction.js";
import { planCsharpProject } from "./project-artifacts.js";
import {
  sourceFileArtifactPath,
  validateSourceFileOutputIdentities,
} from "./source-paths.js";
import {
  planCsharpObjectShapeSourceFile,
} from "./object-shapes.js";
import {
  planCsharpGeneratedHelperSourceFile,
} from "./generated-helpers.js";
import {
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export interface CsharpPlanningResult {
  readonly artifacts: readonly TargetArtifact[];
  readonly diagnostics: readonly TargetDiagnostic[];
}

export function planCsharpArtifacts(input: CsharpTranslationContext): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = input.projectTypes.issues.map(
    (issue) => targetPolicyDiagnostic(
      issue.node,
      issue.code,
      issue.message,
    ),
  );
  if (diagnostics.length > 0) {
    return {
      artifacts: [],
      diagnostics,
    };
  }
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
  const plannedSources = reconstructCsharpSourceFiles(
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
  const unfulfilledStorageRequirements =
    input.artifacts.unfulfilledStorageRequirements();
  if (unfulfilledStorageRequirements.length > 0) {
    diagnostics.push(...unfulfilledStorageRequirements.map((requirement) =>
      unsupportedNodeDiagnostic(
        requirement.expression,
        requirement.reason,
      )
    ));
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
  const generatedHelpers = planCsharpGeneratedHelperSourceFile(input);
  const startup = planCsharpStartupSourceFile(
    input,
    plannedSources,
    moduleInitialization,
    diagnostics,
  );
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
      ...(generatedHelpers === undefined ? [] : [generatedHelpers]),
      ...(startup === undefined ? [] : [startup]),
    ],
  });
  return {
    artifacts,
    diagnostics,
  };
}
