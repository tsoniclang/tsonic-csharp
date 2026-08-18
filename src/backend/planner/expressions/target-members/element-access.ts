import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
} from "../../../roslyn/syntax.js";
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

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  return translateCsharpElementAccess(
    elementAccess,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
}
