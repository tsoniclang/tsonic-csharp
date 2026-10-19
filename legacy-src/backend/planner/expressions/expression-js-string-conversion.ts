import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import { targetPolicyDiagnostic } from "../diagnostics.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { mapCsharpPlannedValue } from "./planned-values.js";
import type { CsharpNativeHandler } from "../../../target-model/records/native-handlers.js";

export function planCsharpJsStringConversion(
  node: Node,
  selection: Extract<CsharpNativeHandler, { readonly kind: "js-string-conversion" }>["selection"],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  if (selection.kind === "rejected") {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_JS_STRING_CONVERSION_REJECTED",
      selection.reason,
    ));
    return undefined;
  }
  return mapCsharpPlannedValue(
      planExpression(
        selection.sourceValue,
        sourceFile,
        input,
        diagnostics,
      ),
      selection.resultType,
      (expression) => expression,
    );
}
