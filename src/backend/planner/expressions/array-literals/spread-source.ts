import type { CsharpPlannedArraySpreadInput } from "./types.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/native-type-data.js";
import type { CsharpPlanningContext } from "../../planning-data.js";
import type { ExpressionPlanner } from "../../planning-data.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export function planCsharpArraySpreadInput(node: Node, expression: Node, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], elementTarget: TargetTypeRef,
  planExpression: ExpressionPlanner): CsharpPlannedArraySpreadInput {
  const selected = input.program.records.arraySpread.get(expression, elementTarget);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted array spread requires its native storage and element conversions.", node);
  const type = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted array spread requires its native source type.", node);
  const elements = selected.elements.map(element => ({ ...element,
    type: csharpTypeFromTargetTypeRef(element.carrier, input.scope.typeParameterNames)
      ?? failCsharpPlannerInvariant("An admitted array spread requires its native element type.", node) }));
  const planned = planExpression(expression, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted array spread requires its native value.", expression);
  if (planned.completion.kind !== "value" && planned.completion.kind !== "never")
    failCsharpPlannerInvariant("An admitted array spread requires its value or never completion.", expression);
  return { ...planned, source: { carrier: selected.carrier, type, elements, lengthMember: selected.lengthMember, sequence: selected.sequence } };
}
