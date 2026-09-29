import {
  rejectedTargetStage,
  runTargetCompilationStages,
} from "@tsonic/target-api/artifacts";
import type { TargetCompileResult } from "@tsonic/target-api/artifacts";
import {
  analyzeCsharpTargetProgram,
} from "../analysis/program/index.js";
import type {
  CsharpTargetAnalysisRequest,
} from "../analysis/program/index.js";
import { planCsharpOutput } from "./planner/program/planning.js";
import { createCsharpPlanningContext } from "./planner/context.js";
import { materializeCsharpOutputPlan } from "./emission/materialize.js";
import { selectedPolicyDiagnostic } from "./planner/diagnostics.js";

export function compileCsharpTarget(
  request: CsharpTargetAnalysisRequest,
): TargetCompileResult {
  const before = request.providers.validateReferences();
  if (before.length !== 0) {
    return rejectedTargetStage(before.map(diagnostic => selectedPolicyDiagnostic(undefined, diagnostic)));
  }
  const result = runTargetCompilationStages({
    analyze: () => analyzeCsharpTargetProgram(request),
    plan: (program) => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  });
  const after = request.providers.validateReferences();
  return after.length === 0 ? result : rejectedTargetStage([
    ...result.diagnostics,
    ...after.map(diagnostic => selectedPolicyDiagnostic(undefined, diagnostic)),
  ]);
}
