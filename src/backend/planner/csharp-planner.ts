import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "./context.js";
import type { CsharpOutputPlan } from "../artifacts/model.js";
import { planCsharpStartupSourceFile } from "./program/startup.js";
import { planCsharpModuleInitialization } from "./program/module-initialization.js";
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
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export type CsharpPlanningResult =
  | { readonly kind: "planned"; readonly plan: CsharpOutputPlan }
  | { readonly kind: "rejected"; readonly diagnostics: readonly TargetDiagnostic[] };

export function planCsharpOutput(input: CsharpPlanningContext): CsharpPlanningResult {
  const diagnostics: TargetDiagnostic[] = input.projectTypes.issues.map(
    (issue) => targetPolicyDiagnostic(
      issue.node,
      issue.code,
      issue.message,
    ),
  );
  if (diagnostics.length > 0) {
    return {
      kind: "rejected",
      diagnostics,
    };
  }
  validateSourceFileOutputIdentities(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      kind: "rejected",
      diagnostics,
    };
  }
  const moduleInitialization = planCsharpModuleInitialization(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      kind: "rejected",
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
      kind: "rejected",
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
      kind: "rejected",
      diagnostics,
    };
  }
  const objectShapes = planCsharpObjectShapeSourceFile(input, diagnostics);
  if (diagnostics.length > 0) {
    return {
      kind: "rejected",
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
      kind: "rejected",
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
      kind: "rejected",
      diagnostics,
    };
  }
  const plan: CsharpOutputPlan = {
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
  };
  return { kind: "planned", plan };
}
