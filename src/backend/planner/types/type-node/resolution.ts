import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../target-type-object-shapes.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function getCsharpTypeForNode(
  node: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) failCsharpPlannerInvariant("An admitted native type use requires its exact checked source subject.");
  const carrier = input.program.records.valueRead.get(node)?.value;
  if (carrier === undefined) failCsharpPlannerInvariant("An admitted type use requires its exact sealed native carrier.", node);
  const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, carrier, diagnostics, node);
  if (type === undefined) failCsharpPlannerInvariant("An admitted native type requires its exact finalized syntax.", node);
  return type;
}
