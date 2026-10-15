import type { CsharpPlanningContext } from "../../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  translateCsharpCallExpression,
} from "./selected-call.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";

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
