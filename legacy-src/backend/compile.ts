import {
  rejectedTargetStage,
  runTargetCompilationStages,
  targetDiagnosticFromExtension,
} from "@tsonic/target-api/artifacts";
import type {
  TargetCompilationObserver,
  TargetCompileResult,
} from "@tsonic/target-api/artifacts";
import {
  analyzeCsharpTargetProgram,
} from "../analysis/program/index.js";
import type {
  CsharpTargetAnalysisRequest,
  CsharpTargetProgram,
} from "../analysis/program/index.js";
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
  const before = request.providers.validateReferences();
  if (before.length !== 0) {
    return rejectedTargetStage(before.map(diagnostic => targetDiagnosticFromExtension(undefined, diagnostic)));
  }
  const result = runTargetCompilationStages({
    analyze: () => analyzeCsharpTargetProgram(request),
    plan: (program) => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  }, observer);
  const after = request.providers.validateReferences();
  return after.length === 0 ? result : rejectedTargetStage([
    ...result.diagnostics,
    ...after.map(diagnostic => targetDiagnosticFromExtension(undefined, diagnostic)),
  ]);
}
