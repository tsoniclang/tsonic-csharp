import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlannedValue } from "./planned-values.js";
import type { CsharpPlanningContext } from "../planning-data.js";
import {
  translateCsharpConstruction,
} from "./constructions.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../planning-data.js";

export function planNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  return translateCsharpConstruction(
    node,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
}
