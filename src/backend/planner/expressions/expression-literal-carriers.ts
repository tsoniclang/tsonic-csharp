import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function requireCsharpStringRuntimeCarrier(node: Node, _sourceFile: SourceFile, input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[], _description: string): boolean {
  if (input.program.records.valueRead.get(node) === undefined)
    failCsharpPlannerInvariant("An admitted source string requires its sealed native value record.", node);
  return true;
}
