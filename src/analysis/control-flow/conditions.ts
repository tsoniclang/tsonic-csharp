import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function analyzeCsharpConditions(input: { readonly ast: AstReader; readonly nodes: readonly Node[]; readonly demand: CsharpNativeDemandAnalysis;
  readonly operations: Pick<CsharpTargetOperationClassifications, "jsCondition">; readonly values: CsharpValueReadClassifications }): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const visited = new Set<Node>();
  // A C# condition is a bool: JS truthiness is admitted only through a resolved JS condition operation.
  const check = (node: Node, context: string): void => {
    const selected = input.operations.jsCondition.get(node);
    const carrier = input.values.valueRead.get(node)?.value;
    const message = selected === undefined ? `${context} has no sealed C# condition classification.`
      : selected.kind === "rejected" ? selected.reason
      : selected.kind !== "resolved" && (carrier === undefined || !targetTypeRefEquals(carrier, csharpSourcePrimitiveTargetType("bool")))
        ? `${context} requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission.`
        : undefined;
    if (message !== undefined) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased" || use.evaluation.kind !== "conditional") continue;
    const condition = input.demand.nativeUse.get(use.evaluation.condition);
    if (condition === undefined || condition.kind === "erased" || visited.has(condition.expression)) continue;
    const node = condition.expression;
    visited.add(node);
    check(node, "Conditional expression condition");
  }
  // Statement conditions (if, while, do, for) that are emitted carry the same rule.
  for (const node of new Set(input.nodes)) {
    const statement = input.ast.is.IsIfStatement(node) ? ["If statement", input.ast.as.AsIfStatement(node)?.Expression] as const
      : input.ast.is.IsWhileStatement(node) ? ["While statement", input.ast.as.AsWhileStatement(node)?.Expression] as const
      : input.ast.is.IsDoStatement(node) ? ["Do statement", input.ast.as.AsDoStatement(node)?.Expression] as const
      : input.ast.is.IsForStatement(node) ? ["For statement", input.ast.as.AsForStatement(node)?.Condition] as const : undefined;
    const condition = statement?.[1];
    if (statement === undefined || condition === undefined || visited.has(condition)) continue;
    const emitted = input.demand.nativeUse.expression(condition);
    if (emitted === undefined || emitted.use.kind === "erased") continue;
    visited.add(condition);
    check(condition, `${statement[0]} condition`);
  }
  return Object.freeze(issues);
}
