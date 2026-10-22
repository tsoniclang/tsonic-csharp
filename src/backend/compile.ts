import { rejectedTargetStage, runTargetCompilationStages, targetDiagnosticFromExtension } from "@tsonic/target-api/artifacts";
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
  const result = runTargetCompilationStages({
    analyze: () => analyzeCsharpTargetProgram(request),
    plan: program => planCsharpOutput(createCsharpPlanningContext(program)),
    materialize: materializeCsharpOutputPlan,
  }, observer);
  // References are validated before analysis (analysis/program/analyze.ts) and once more after materialization: a
  // reference that changed while the program was analyzed, planned or materialized rejects the whole result.
  const after = request.providers.validateReferences();
  return after.length === 0 ? result : rejectedTargetStage([
    ...result.diagnostics,
    ...after.map(diagnostic => targetDiagnosticFromExtension(undefined, diagnostic)),
  ]);
}
