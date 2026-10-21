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
