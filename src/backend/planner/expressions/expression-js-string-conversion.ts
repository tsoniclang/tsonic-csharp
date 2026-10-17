import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
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
    return failCsharpPlannerInvariant("A selected JS string refusal must be rejected before native publication.", node);
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
