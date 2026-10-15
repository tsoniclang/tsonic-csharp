import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import {
  translateCsharpElementAccess,
} from "./selected-element.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import type { CsharpPlannedValue } from "../planned-values.js";

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  return translateCsharpElementAccess(
    elementAccess,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
}
