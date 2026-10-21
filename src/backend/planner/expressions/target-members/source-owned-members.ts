import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../context.js";
import { translateCsharpJsValueInvocation } from "../js-value-operations.js";
import { planFlowReadUseSiteProjection } from "../flow-read-projections.js";
import { planCsharpSourceMemberName } from "./source-member-names.js";
import { planCsharpNativeUnionPropertyProjection } from "../union-projections.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { projectCsharpPlannedValue, projectCsharpPlannedMember } from "../planned-value-composition.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

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
    planned = selected.kind === "member" ? projectCsharpPlannedMember(node, sourceFile, input, diagnostics, receiver, name, conditional, selected.static)
      : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value =>
        translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.operation, value, [{ kind: "LiteralExpression", value: selected.name }]));
  }
  if (planned === undefined) failCsharpPlannerInvariant("An admitted source property requires its exact native read operation.", node);
  if (!selected.flow) return planned;
  const projected = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, planned,
    value => planFlowReadUseSiteProjection(node, value, sourceFile, input, diagnostics));
  return projected === undefined ? undefined : { ...projected, address: planned.address };
}
