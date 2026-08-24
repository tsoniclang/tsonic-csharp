import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { targetPolicyDiagnostic } from "../diagnostics.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";

export type CsharpJsStringConversionPlan =
  | { readonly handled: false }
  | { readonly handled: true; readonly expression?: CsharpExpression };

export function tryPlanCsharpJsStringConversion(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpJsStringConversionPlan {
  const selection = input.program.operations.jsStringConversion(node);
  if (
    selection === undefined ||
    selection.kind === "not-js-string-conversion"
  ) {
    return { handled: false };
  }
  if (selection.kind === "rejected") {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_JS_STRING_CONVERSION_REJECTED",
      selection.reason,
    ));
    return { handled: true };
  }
  return {
    handled: true,
    expression: planExpression(
      selection.sourceValue,
      sourceFile,
      input,
      diagnostics,
    ),
  };
}
