import type { CsharpPlanningContext } from "../planning-data.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CallArgumentPlanner, ExpressionPlanner } from "../planning-data.js";
import { translateCsharpCallExpression } from "./calls/entry.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import type { DestructuringPlannerState } from "../planning-data.js";

export function planCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  return translateCsharpCallExpression(
    node,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
    state,
  );
}
