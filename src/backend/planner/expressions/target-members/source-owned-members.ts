import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../context.js";
import { translateCsharpJsValueInvocation } from "../js-value-operations.js";
import { planFlowReadUseSiteProjection } from "../flow-read-projections.js";
import { planCsharpSourceMemberName } from "./source-member-names.js";
import { planCsharpNativeUnionPropertyProjection } from "../union-projections.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { projectCsharpPlannedValue } from "../planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function translateCsharpSourceOwnedMember(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], receiver: CsharpPlannedValue, conditional: boolean): CsharpPlannedValue | undefined {
  const selected = input.program.records.sourceMemberEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted source property requires its exact native member emission plan.", node);
  let planned: CsharpPlannedValue | undefined;
  if (selected.kind === "union") {
    const projection = input.program.records.unionPropertyProjection.get(node);
    if (projection === undefined) failCsharpPlannerInvariant("An admitted union property requires its exact indexed native payloads.", node);
    if (conditional) failCsharpPlannerInvariant("An admitted runtime-union projection requires its selected present receiver.", node);
    planned = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver,
      value => planCsharpNativeUnionPropertyProjection(node, value, projection, input), projection.resultCarrier);
  } else {
    const name = selected.kind === "member" ? planCsharpSourceMemberName(node, selected.methodValue, input) : selected.name;
    planned = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => selected.kind === "js-value"
      ? translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.operation, value, [{ kind: "LiteralExpression", value: selected.name }])
      : { kind: conditional ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression", receiver: value, name });
  }
  if (planned === undefined) failCsharpPlannerInvariant("An admitted source property requires its exact native read operation.", node);
  return selected.flow ? projectCsharpPlannedValue(node, sourceFile, input, diagnostics, planned,
    value => planFlowReadUseSiteProjection(node, value, sourceFile, input, diagnostics)) : planned;
}
