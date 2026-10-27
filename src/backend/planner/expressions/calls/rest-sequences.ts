import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { projectCsharpPlannedValue } from "../planned-value-composition.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import type { CsharpRestSequence } from "../../../../target-model/records/objects/rest-sequences.js";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { planCsharpSequenceValue } from "../sequence-conversions.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export function planCsharpRestSequence(sequence: CsharpRestSequence, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.restSequence.get(sequence)
    ?? failCsharpPlannerInvariant("An admitted rest sequence requires its exact native collection and conversion plan.", sequence.expression);
  const actual = selected.spread.carrier;
  const source = planExpression(sequence.expression, sourceFile, input, diagnostics);
  const type = csharpTypeFromTargetTypeRef(actual, input.scope.typeParameterNames);
  const elementType = csharpTypeFromTargetTypeRef(sequence.targetElementType, input.scope.typeParameterNames);
  const elements = selected.spread.elements.map(element => ({ ...element, type: csharpTypeFromTargetTypeRef(element.carrier, input.scope.typeParameterNames) }));
  if (type === undefined || elementType === undefined || elements.some(element => element.type === undefined))
    failCsharpPlannerInvariant("An admitted rest sequence requires its renderable native collection and element types.", sequence.expression);
  if (source === undefined) return undefined;
  if (selected.direct) return projectCsharpPlannedValue(sequence.expression, sourceFile, input, diagnostics, source,
    value => ({ kind: "CastExpression", type: { kind: "ArrayType", elementType },
      expression: { kind: "CollectionExpression", elements: [{ kind: "SpreadElement", expression: value }] } }), selected.spread.sequence.resultCarrier);
  return planCsharpSequenceValue(sequence.expression, { ...source, source: { carrier: actual, type,
    lengthMember: selected.spread.lengthMember, sequence: selected.spread.sequence, elements: elements.map(element => ({ ...element, type: element.type! })) } },
    sourceFile, input, diagnostics, elementType, sequence.targetElementType);
}
