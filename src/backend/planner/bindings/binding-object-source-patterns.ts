import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { planCsharpBindingDefaultValue } from "./optional-values.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";
import type { CsharpNativeBindingProperty } from "../../../target-model/records/objects/value-projections.js";

export function planCsharpNativePropertyRead(
  property: CsharpNativeBindingProperty,
  sourceExpression: CsharpExpression,
  sourceNode: Node,
): CsharpExpression {
  const { member, receiver, invocation } = property;
  if (receiver.kind !== "instance") return failCsharpPlannerInvariant("An admitted native property read requires its exact receiver relation.", sourceNode);
  if (invocation.kind === "member") return { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: member.targetName };
  return { kind: "SimpleMemberAccessExpression", receiver: { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: invocation.call.targetName },
    arguments: [] }, name: member.targetName };
}

export function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression: ExpressionPlanner,
): readonly CsharpStatement[] {
  const element = input.program.source.ast.as.AsBindingElement(elementNode);
  const selected = input.program.records.bindingPatternProjection.get(elementNode)?.element;
  if (element?.name === undefined || selected?.kind !== "source-owned-member" && selected?.kind !== "native-member") return failCsharpPlannerInvariant(
    "Source-owned binding requires its admitted direct member projection.", elementNode);
  if (selected.kind === "native-member") {
    const value = planCsharpNativePropertyRead(selected.property, sourceExpression, elementNode);
    if (element.Initializer === undefined) return planBindingNameFromProjection(element.name, value,
      elementNode, sourceFile, input, diagnostics, state);
    const contract = input.program.records.bindingPatternProjection.get(elementNode)?.defaultValue;
    if (contract === undefined) return failCsharpPlannerInvariant(
      "An admitted native binding default requires its exact contract and renderer.", elementNode);
    const initial = planExpression(element.Initializer, sourceFile, input, diagnostics, state);
    if (initial === undefined) failCsharpPlannerInvariant("An admitted native binding default requires its initializer.", elementNode);
    const defaulted = planCsharpBindingDefaultValue(element.Initializer, sourceFile, input, diagnostics, value, contract, initial, state);
    if (defaulted === undefined) failCsharpPlannerInvariant("An admitted native binding default requires its native completion.", elementNode);
    return consumeCsharpPlannedValue(defaulted, expression => planBindingNameFromProjection(element.name!, expression,
      elementNode, sourceFile, input, diagnostics, state));
  }
  return planBindingNameFromProjection(element.name, {
    kind: "SimpleMemberAccessExpression", receiver: sourceExpression,
    name: selected.propertyName,
  }, elementNode, sourceFile, input, diagnostics, state);
}
