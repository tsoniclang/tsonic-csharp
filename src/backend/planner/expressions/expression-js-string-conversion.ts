import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
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
    failCsharpPlannerInvariant("An admitted JS string conversion requires its native selected conversion.", node);
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
