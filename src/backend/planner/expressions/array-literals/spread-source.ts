import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../../../target-model/conversions/selection.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export interface CsharpArraySpreadInput {
  readonly carrier: TargetTypeRef;
  readonly type: CsharpTypeNode;
  readonly expression: CsharpExpression;
  readonly elements: readonly { readonly carrier: TargetTypeRef; readonly type: CsharpTypeNode; readonly conversion: CsharpConversionSelection }[];
  readonly lengthMember: string | undefined;
}

export interface CsharpPlannedArraySpreadInput extends CsharpPlannedValue {
  readonly source: Omit<CsharpArraySpreadInput, "expression">;
}

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
  return { ...planned, source: { carrier: selected.carrier, type, elements, lengthMember: selected.lengthMember } };
}
