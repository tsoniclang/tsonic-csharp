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
import type { CsharpNativeBindingProperty } from "../../../target-model/records/objects/value-projections.js";

function planNativeBindingProperty(
  property: CsharpNativeBindingProperty,
  receiver: CsharpExpression,
  node: Node,
  input: CsharpPlanningContext,
): CsharpExpression {
  if (property.invocation.kind === "member" && property.receiver.kind === "instance") {
    return { kind: "SimpleMemberAccessExpression", receiver, name: property.member.targetName };
  }
  if (property.invocation.kind !== "receiver-call" || property.receiver.kind !== "target-parameter" ||
      property.receiver.targetParameterIndex !== 0 || property.member.declaringType === undefined) {
    return failCsharpPlannerInvariant("An admitted native binding requires its sealed receiver relation.", node);
  }
  const owner = csharpTypeFromTargetTypeRef(property.member.declaringType, input.scope.typeParameterNames);
  if (owner === undefined) return failCsharpPlannerInvariant("An admitted native binding requires its renderable owner.", node);
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner,
    name: property.member.targetName }, arguments: [{ kind: "Argument", expression: receiver }] };
}

export function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
  planExpression: ExpressionPlanner | undefined,
): readonly CsharpStatement[] {
  const element = input.program.source.ast.as.AsBindingElement(elementNode);
  const selected = input.program.records.bindingPatternProjection.get(elementNode)?.element;
  if (element?.name === undefined || selected?.kind !== "source-owned-member" && selected?.kind !== "native-member") return failCsharpPlannerInvariant(
    "Source-owned binding requires its admitted direct member projection.", elementNode);
  if (selected.kind === "native-member") {
    const value = planNativeBindingProperty(selected.property, sourceExpression, elementNode, input);
    if (element.Initializer === undefined) return planBindingNameFromProjection(element.name, value,
      elementNode, sourceFile, input, diagnostics, state);
    const contract = input.program.records.bindingPatternProjection.get(elementNode)?.defaultValue;
    if (contract === undefined || planExpression === undefined) return failCsharpPlannerInvariant(
      "An admitted native binding default requires its exact contract and expression planner.", elementNode);
    const initial = planExpression(element.Initializer, sourceFile, input, diagnostics, state);
    if (initial === undefined) return failCsharpPlannerInvariant("An admitted native binding default requires its initializer.", elementNode);
    const defaulted = planCsharpBindingDefaultValue(element.Initializer, sourceFile, input, diagnostics, value, contract, initial, state);
    if (defaulted === undefined) return failCsharpPlannerInvariant("An admitted native binding default requires its native completion.", elementNode);
    return consumeCsharpPlannedValue(defaulted, expression => planBindingNameFromProjection(element.name!, expression,
      elementNode, sourceFile, input, diagnostics, state));
  }
  return planBindingNameFromProjection(element.name, {
    kind: "SimpleMemberAccessExpression", receiver: sourceExpression,
    name: selected.propertyName,
  }, elementNode, sourceFile, input, diagnostics, state);
}
