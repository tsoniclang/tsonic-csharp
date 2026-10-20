import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function analyzeCsharpConditions(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly operations: Pick<CsharpTargetOperationClassifications, "jsCondition">; readonly values: CsharpValueReadClassifications }): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const visited = new Set<Node>();
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased" || use.evaluation.kind !== "conditional") continue;
    const condition = input.demand.nativeUse.get(use.evaluation.condition);
    if (condition === undefined || condition.kind === "erased" || visited.has(condition.expression)) continue;
    const node = condition.expression;
    visited.add(node);
    const selected = input.operations.jsCondition.get(node);
    const carrier = input.values.valueRead.get(node)?.value;
    const message = selected === undefined ? "Conditional expression condition has no sealed C# condition classification."
      : selected.kind === "rejected" ? selected.reason
      : selected.kind !== "resolved" && (carrier === undefined || !targetTypeRefEquals(carrier, csharpSourcePrimitiveTargetType("bool")))
        ? "Conditional expression condition requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission." : undefined;
    if (message !== undefined) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  }
  return Object.freeze(issues);
}
