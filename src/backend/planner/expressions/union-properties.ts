import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPropertyClassification } from "../../../target-model/records/operations.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { planCsharpNativeUnionProjection } from "./union-projections.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { projectCsharpPlannedValue } from "./planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

type CsharpUnionProperty = Extract<CsharpPropertyClassification["selection"], { readonly kind: "union-property" }>;

export function planCsharpUnionProperty(node: Node, fact: CsharpUnionProperty, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue | undefined {
  const receiver = planExpression(fact.source.receiver.expression, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted union property requires its native receiver.", node);
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value =>
    planCsharpNativeUnionProjection(node, value, fact, input, diagnostics, variant => variant.operation,
      (payload, operation) => ({ kind: "SimpleMemberAccessExpression", receiver: payload, name: operation.targetMember.targetName })), fact.resultCarrier);
}
