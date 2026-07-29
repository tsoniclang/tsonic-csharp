import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import type {
  CsharpTranslationContext,
} from "../../../translate/context/index.js";
import {
  translateCsharpElementAccess,
} from "../../../translate/expressions/elements.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
