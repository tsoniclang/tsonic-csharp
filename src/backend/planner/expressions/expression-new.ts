import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  translateCsharpConstruction,
} from "./constructions.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";

export function planNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  return translateCsharpConstruction(
    node,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
}
