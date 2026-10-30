import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceExpressionResultDisposition } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../../../target-model/records/native/native-demand.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/operations/conversions.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function analyzeCsharpAwaitAdmission(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly values: CsharpValueReadClassifications; readonly operations: Pick<CsharpTargetOperationClassifications, "awaitCompletion"> }): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const visited = new Set<Node>();
  for (const { use } of input.demand.entries) {
    const node = use.expression;
    if (use.kind === "erased" || visited.has(node) || !input.ast.is.IsAwaitExpression(node)) continue;
    visited.add(node);
    const expression = input.ast.as.AsAwaitExpression(node)?.Expression;
    const completion = input.operations.awaitCompletion.get(node);
    const carrier = expression === undefined ? undefined : input.values.valueRead.get(expression)?.value;
    const result = input.values.valueRead.get(node)?.value;
    const discarded = sourceExpressionResultDisposition(input.ast, node).kind === "discarded";
    const message = expression === undefined ? "Await expression must have an expression."
      : completion === undefined || carrier === undefined
        ? "Await expression emission requires a finalized Promise/Task target carrier fact for the awaited expression. Runtime carrier fact is missing for the awaited expression."
      : !discarded && (result === undefined || !targetTypeRefEquals(result, completion.result))
        ? "Await expression emission requires the finalized await-result carrier to match the awaited Promise/Task result carrier. Runtime carrier fact is missing for the await expression result."
        : undefined;
    if (message !== undefined) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  }
  return Object.freeze(issues);
}
