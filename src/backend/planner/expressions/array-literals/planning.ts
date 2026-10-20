import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import type { ArrayLiteralPlanner } from "./types.js";
import { planArrayLiteralExpression } from "./dense-array.js";
import { planTupleLiteralExpression } from "./tuple.js";
import { planNativeCollectionArrayLiteralExpression } from "./native-collection.js";
import { planJsArrayLiteralExpression } from "./js-array.js";
import type { CsharpPlannedValue } from "../planned-values.js";

export type { ArrayLiteralPlanner } from "./types.js";
export { planArrayLiteralExpression } from "./dense-array.js";
export { planTupleLiteralExpression } from "./tuple.js";

export function planArrayLiteralExpressionWithCarrier(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], carrier: TargetTypeRef, planner: ArrayLiteralPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.arrayLiteral.get(node, carrier);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted array literal requires its exact native construction selection.", node);
  const type = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted array literal requires its selected native construction type.", node);
  if (selected.kind === "tuple") {
    if (selected.carrier.kind !== "tuple") failCsharpPlannerInvariant("An admitted tuple requires its exact native tuple storage.", node);
    return planTupleLiteralExpression(node, sourceFile, input, diagnostics, planner, type, selected.carrier);
  }
  const element = selected.element;
  if (element === undefined) failCsharpPlannerInvariant("An admitted collection requires its selected native element carrier.", node);
  const elementType = csharpTypeFromTargetTypeRef(element, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted collection requires its selected native element type.", node);
  switch (selected.kind) {
    case "array": return planArrayLiteralExpression(node, sourceFile, input, diagnostics, elementType, planner, element);
    case "js": return planJsArrayLiteralExpression(node, sourceFile, input, diagnostics, selected.carrier, type, elementType, element, planner);
    case "collection": return planNativeCollectionArrayLiteralExpression(node, sourceFile, input, diagnostics, selected.carrier, element, planner);
  }
}
