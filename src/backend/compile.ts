import {
  runTargetCompilationStages,
} from "@tsonic/target-api/artifacts";
import type { TargetCompileResult } from "@tsonic/target-api/artifacts";
import {
  analyzeCsharpTargetProgram,
} from "../analysis/program/index.js";
import type {
  CsharpTargetAnalysisRequest,
} from "../analysis/program/index.js";
import { planCsharpOutput } from "./planner/csharp-planner.js";
import { createCsharpPlanningContext } from "./planner/context.js";
import { materializeCsharpOutputPlan } from "./emission/materialize.js";

export function compileCsharpTarget(
  request: CsharpTargetAnalysisRequest,
): TargetCompileResult {
  return runTargetCompilationStages({
    analyze: () => analyzeCsharpTargetProgram(request),
    plan: (program) => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  });
}
