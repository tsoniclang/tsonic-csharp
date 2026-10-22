import { runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import type {
  TargetCompilationObserver,
  TargetCompileResult,
} from "@tsonic/target-api/artifacts";
import { analyzeCsharpTargetProgram } from "../analysis/program/index.js";
import type { CsharpTargetAnalysisRequest } from "../analysis/program/index.js";
import type { CsharpTargetProgram } from "../target-model/records/target-program.js";
import { planCsharpOutput } from "./planner/program/planning.js";
import { createCsharpPlanningContext } from "./planner/context.js";
import { materializeCsharpOutputPlan } from "./emission/materialize.js";

export function compileCsharpTarget(
  request: CsharpTargetAnalysisRequest,
  observer?: TargetCompilationObserver<
    CsharpTargetProgram,
    Extract<ReturnType<typeof planCsharpOutput>, { readonly kind: "resolved" }>["value"]
  >,
): TargetCompileResult {
  return runTargetCompilationStages({
    analyze: () => analyzeCsharpTargetProgram(request),
    plan: program => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  }, observer);
}
