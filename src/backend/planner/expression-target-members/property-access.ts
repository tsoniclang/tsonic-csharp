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
  translateCsharpPropertyAccess,
} from "../../../translate/expressions/properties.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  return translateCsharpPropertyAccess(
    propertyAccess,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
}
