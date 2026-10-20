import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { DestructuringPlannerState } from "../bindings/index.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { CsharpPlannedArgument } from "./planned-values.js";
import { mapCsharpPlannedValue } from "./planned-values.js";
import { planCsharpPropertyValueProjection } from "./property-value-projection.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function planCallArgumentCore(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, state: DestructuringPlannerState | undefined, parameter: CsharpTargetParameter | undefined): CsharpPlannedArgument | undefined {
  const selected = input.program.records.argumentPassing.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native argument requires its exact source passing and storage plan.", node);
  const projection = parameter === undefined ? false : input.program.records.argumentProjection.get(node, parameter);
  if (projection === undefined) failCsharpPlannerInvariant("An admitted argument requires its exact parameter-specific property projection plan.", node);
  const original = projection ? planExpression(selected.expression, sourceFile, input, diagnostics, state) : undefined;
  const expression = projection && parameter !== undefined ? mapCsharpPlannedValue(original, parameter.type, value =>
    planCsharpPropertyValueProjection(selected.expression, sourceFile, input, diagnostics, original?.completion.carrier, value)) :
    planExpression(selected.expression, sourceFile, selected.passing === undefined ? input : { ...input, storageExpression: selected.expression }, diagnostics, state);
  return expression === undefined ? undefined : { ...expression, ...(selected.passing === undefined ? {} : { passing: selected.passing }),
    ...(selected.location === undefined ? {} : { nativeLocation: selected.location }), ...(selected.suspends ? { suspends: true as const } : {}) };
}
