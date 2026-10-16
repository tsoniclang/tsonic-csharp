import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { requireCsharpIdentifier } from "../../../target-model/names/identifiers.js";

export function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = input.program.source.ast.as.AsBindingElement(elementNode);
  const selected = input.program.records.bindingPatternProjection.get(elementNode)?.element;
  if (element?.name === undefined || selected?.kind !== "source-owned-member") return failCsharpPlannerInvariant(
    "Source-owned binding requires its admitted direct member projection.", elementNode);
  return planBindingNameFromProjection(element.name, {
    kind: "SimpleMemberAccessExpression", receiver: sourceExpression,
    name: requireCsharpIdentifier(selected.propertyName, diagnostics, "Object destructuring source property"),
  }, undefined, elementNode, sourceFile, input, diagnostics, state);
}
