import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPropertyClassification } from "../../../target-model/records/operations.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { planCsharpNativeUnionPropertyProjection } from "./union-projections.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { projectCsharpPlannedValue } from "./planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

type CsharpUnionProperty = Extract<CsharpPropertyClassification["selection"], { readonly kind: "union-property" }>;

export function planCsharpUnionProperty(node: Node, fact: CsharpUnionProperty, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue | undefined {
  const receiver = planExpression(fact.source.receiver.expression, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted union property requires its native receiver.", node);
  const projection = input.program.records.unionPropertyProjection.get(node);
  if (projection === undefined) failCsharpPlannerInvariant("An admitted union property requires its exact indexed native payloads.", node);
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value =>
    planCsharpNativeUnionPropertyProjection(node, value, projection, input), projection.resultCarrier);
}
