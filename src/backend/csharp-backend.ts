import type {
  TargetBackend,
  TargetBackendContext,
  TargetCompileInput,
} from "@tsonic/target-api";
import type { TargetCompileResult } from "@tsonic/target-api/artifacts";
import { planCsharpOutput } from "./planner/csharp-planner.js";
import { createCsharpPlanningContext } from "./planner/context.js";
import { materializeCsharpOutputPlan } from "./emission/materialize.js";

export function createCsharpBackend(context: TargetBackendContext): TargetBackend {
  return {
    compile(input: TargetCompileInput): TargetCompileResult {
      const planning = planCsharpOutput(
        createCsharpPlanningContext(context, input),
      );
      return planning.kind === "rejected"
        ? { artifacts: [], diagnostics: planning.diagnostics }
        : { artifacts: materializeCsharpOutputPlan(planning.plan), diagnostics: [] };
    },
  };
}
