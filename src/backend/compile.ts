import { analyzeCsharpProject } from "../analysis/project/index.js";
import { CsharpProviderAcquisitionRejection } from "../providers/model/relation-resolver.js";
import { rejectedTargetStage, targetDiagnosticFromExtension } from "@tsonic/target-api/artifacts";
import { runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import type {
  TargetCompilationObserver,
  TargetCompileResult,
} from "@tsonic/target-api/artifacts";
import {
  analyzeCsharpTargetProgram,
} from "../analysis/program/index.js";
import type { CsharpTargetAnalysisRequest } from "../analysis/program/index.js";
import type { CsharpTargetProgram } from "../target-model/program.js";
import { planCsharpOutput } from "./planner/program/planning.js";
import { createCsharpPlanningContext } from "./planner/context.js";
import { materializeCsharpOutputPlan } from "./emission/materialize.js";

export function compileCsharpTarget(
  request: Omit<CsharpTargetAnalysisRequest, "project">,
  observer?: TargetCompilationObserver<
    CsharpTargetProgram,
    Extract<ReturnType<typeof planCsharpOutput>, { readonly kind: "resolved" }>["value"]
  >,
): TargetCompileResult {
  return runTargetCompilationStages({
    analyze() {
      const project = analyzeCsharpProject(request.configuration, request.input.runtimeReferences, request.input.paths.cacheRoot);
      if (project.kind === "rejected") return project;
      try {
        request.providers.prepareRuntimeSources(Object.freeze({
          sources: project.value.runtimeSources,
          projects: project.value.runtimeProjects,
          project: project.value.project,
          properties: project.value.properties,
          cacheRoot: request.input.paths.cacheRoot,
        }));
        return analyzeCsharpTargetProgram({ ...request, project: project.value });
      } catch (error) {
        if (error instanceof CsharpProviderAcquisitionRejection) {
          return rejectedTargetStage([targetDiagnosticFromExtension(undefined, error.diagnostic)]);
        }
        throw error;
      }
    },
    plan: (program) => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  }, observer);
}
