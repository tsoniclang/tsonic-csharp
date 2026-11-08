import type { CsharpPlanningContext } from "../../planning-data.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { ExpressionPlanner } from "../../planning-data.js";
import type { CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export function planObjectShapeSpreadAssignments(
  spreadNode: Node,
  targetShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedObjectInitializer {
  const selected = input.program.records.objectLiteralMember.get(targetShape, spreadNode);
  if (selected?.kind !== "spread") failCsharpPlannerInvariant("An admitted object spread requires its exact native field and presence plan.", spreadNode);
  const value = planExpression(selected.expression, sourceFile, input, diagnostics);
  if (value === undefined) failCsharpPlannerInvariant("An admitted object spread requires its native operand value.", selected.expression);
  return { value, presence: selected.presence, assignments: receiver => selected.fields.map(field => ({
    kind: "AssignmentExpression", name: field.target, carrier: field.carrier,
    expression: { kind: "SimpleMemberAccessExpression", receiver, name: field.source },
  })) };
}
