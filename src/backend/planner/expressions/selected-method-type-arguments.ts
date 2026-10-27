import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSelectedTargetCall } from "../../../target-model/records/objects/members.js";
import type { CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromObjectShapeFact } from "../objects/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function renderSelectedCsharpTargetMethodTypeArguments(selection: CsharpSelectedTargetCall, node: Node,
  _sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): readonly CsharpTypeNode[] {
  const classification = input.program.source.ast.is.IsNewExpression(node)
    ? input.program.records.selectedConstruction.get(node) : input.program.records.selectedCall.get(node);
  const projections = classification?.methodTypeArgumentProjections;
  if (projections === undefined) failCsharpPlannerInvariant("An admitted native method requires its exact type-argument projections.", node);
  return Object.freeze(selection.targetMethodTypeArguments.map((argument, index) => {
    const projection = projections[index]?.projection;
    if (projection === undefined || projection.kind === "rejected")
      failCsharpPlannerInvariant("An admitted native method requires each exact type-argument projection.", node);
    const type = projection.kind === "resolved"
      ? csharpTypeFromObjectShapeFact(input, projection.shape, diagnostics, argument.kind === "selected-source" ? argument.explicitTypeNode ?? node : node)
      : csharpTypeFromTargetTypeRef(argument.targetType, input.scope.typeParameterNames);
    return type ?? failCsharpPlannerInvariant("An admitted native method argument requires its exact target type syntax.", node);
  }));
}
