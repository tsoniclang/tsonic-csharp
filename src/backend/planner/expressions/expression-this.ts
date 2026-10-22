import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planThisExpression(node: Node, _sourceFile: SourceFile, input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[]): CsharpExpression {
  const captured = input.scope.capturedReceivers?.get(node);
  if (captured !== undefined) return captured;
  const selected = input.program.records.thisEmission.get(node)
    ?? failCsharpPlannerInvariant("An admitted this expression requires its exact native receiver binding.", node);
  if (selected.kind === "captured" || selected.kind === "bound" && input.scope.sourceThisBinding === undefined)
    failCsharpPlannerInvariant("An admitted explicit receiver requires its native captured or bound emission context.", node);
  return { kind: "IdentifierName", name: input.scope.sourceThisBinding?.name ?? "this" };
}

// The value stored into a capture frame's receiver field: the receiver of the scope that owns the frame. A captured
// reference reads that field inside the capturing callable; the frame itself is filled from the owner's receiver,
// which is already captured when the owner is a capture method, and is otherwise its own receiver binding.
export function planCapturedReceiverOwnerValue(reference: Node, input: CsharpPlanningContext): CsharpExpression {
  if (input.program.records.thisEmission.get(reference) === undefined)
    failCsharpPlannerInvariant("An admitted captured receiver requires its exact native receiver binding.", reference);
  return input.scope.capturedReceivers?.get(reference)
    ?? { kind: "IdentifierName", name: input.scope.sourceThisBinding?.name ?? "this" };
}
