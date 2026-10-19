import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpPlannedValue } from "../../expressions/planned-values.js";
import type { CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";
import { renderCsharpObjectLiteralCallable } from "./methods.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planObjectShapeAccessorMemberAssignment(
  accessorNode: Node, objectShape: CsharpObjectShapeFact, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpPlannedObjectInitializer {
  const selected = input.program.records.objectLiteralMember.get(objectShape, accessorNode);
  if (selected?.kind !== "accessor") failCsharpPlannerInvariant("An admitted object accessor requires its sealed native callable initialization.", accessorNode);
  const expression = renderCsharpObjectLiteralCallable(accessorNode, selected.callable, sourceFile, input, diagnostics);
  return {
    presence: { kind: "required" }, value: csharpPlannedValue(selected.callable.storage, expression),
    assignments: value => [{ kind: "AssignmentExpression", name: selected.callable.storageName, carrier: selected.callable.storage, expression: value }],
  };
}
