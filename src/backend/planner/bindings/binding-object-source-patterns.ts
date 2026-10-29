import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { ExpressionPlanner } from "../expressions/expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planCsharpBindingDefaultValue } from "./optional-values.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";

export function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression?: ExpressionPlanner,
): readonly CsharpStatement[] {
  const element = input.program.source.ast.as.AsBindingElement(elementNode);
  const selected = input.program.records.bindingPatternProjection.get(elementNode)?.element;
  if (element?.name === undefined || selected?.kind !== "source-owned-member" && selected?.kind !== "native-member") return failCsharpPlannerInvariant(
    "Source-owned binding requires its admitted direct member projection.", elementNode);
  if (selected.kind === "native-member") {
    const { member, receiver, invocation } = selected.property;
    let value: CsharpExpression;
    if (invocation.kind === "member" && receiver.kind === "instance") {
      value = { kind: "SimpleMemberAccessExpression", receiver: sourceExpression, name: member.targetName };
    } else if (invocation.kind === "receiver-call" && receiver.kind === "target-parameter" && receiver.targetParameterIndex === 0) {
      const owner = csharpTypeFromTargetTypeRef(member.declaringType, input.scope.typeParameterNames);
      if (owner === undefined) failCsharpPlannerInvariant("An admitted native binding requires its exact renderable declaring type.", elementNode);
      value = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: member.targetName },
        arguments: [{ kind: "Argument", expression: sourceExpression }] };
    } else return failCsharpPlannerInvariant("An admitted native binding requires its exact receiver relation.", elementNode);
    if (element.Initializer === undefined) return planBindingNameFromProjection(element.name, value,
      elementNode, sourceFile, input, diagnostics, state);
    const contract = input.program.records.bindingPatternProjection.get(elementNode)?.defaultValue;
    if (contract === undefined || planExpression === undefined) return failCsharpPlannerInvariant(
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
