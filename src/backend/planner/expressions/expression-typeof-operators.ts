import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { createDestructuringPlannerState, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { planCsharpRuntimeCategory } from "./runtime-category.js";
import { evaluatedConstant } from "./builders.js";
import { planCsharpClosedTypeTest } from "./type-tests.js";
import { translateCsharpJsValueInvocation } from "./js-value-operations.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues, planCsharpExpressionCompletion, projectCsharpPlannedValue } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier, readCsharpNativeDiscardEvaluation } from "./native-uses.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planTypeofExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  if (!input.program.source.ast.is.IsTypeOfExpression(node)) return undefined;
  return planTypeof(node, sourceFile, input, diagnostics, planExpression, state);
}

export function tryPlanTypeTestExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selected = input.program.records.typePredicateEmission.get(node);
  if (selected === undefined) return undefined;
  const planned = planExpression(selected.left, sourceFile, input, diagnostics, state)
    ?? failCsharpPlannerInvariant("An admitted type test requires its native subject.", selected.left);
  if (selected.kind === "native") return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, planned, (value, prelude) =>
    planCsharpClosedTypeTest(value, selected.fact, input, state ?? createDestructuringPlannerState(sourceFile, input.program.source.ast), prelude,
      readCsharpNativeDiscardEvaluation(input, selected.left)));
  const receiver = planExpression(selected.right, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted local class test requires its native factory receiver.", selected.right);
  const owner = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted local class test requires its native factory owner.", node);
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [planned, receiver], values =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: selected.method },
      arguments: [{ kind: "Argument", expression: values[0]! }, { kind: "Argument", expression: values[1]! }] }, readCsharpNativeExpressionCarrier(input, node)));
}

export function tryPlanTypeofComparisonExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selected = input.program.records.typeofEmission.get(node);
  return selected?.comparison === undefined ? undefined : planTypeof(node, sourceFile, input, diagnostics, planExpression, state);
}

function planTypeof(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, state: DestructuringPlannerState | undefined): CsharpPlannedValue | undefined {
  const selected = input.program.records.typeofEmission.get(node)
    ?? failCsharpPlannerInvariant("An admitted typeof expression requires its sealed native operation.", node);
  const operand = planExpression(selected.operand, sourceFile, input, diagnostics)
    ?? failCsharpPlannerInvariant("An admitted typeof expression requires its native operand.", selected.operand);
  const operation = selected.operation;
  const evaluation = readCsharpNativeDiscardEvaluation(input, selected.operand);
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, operand, (value, prelude) => {
    if (operation.kind === "constant") return evaluatedConstant(value, operand.completion.carrier, operation.value, prelude, evaluation);
    if (operation.kind === "category") return planCsharpRuntimeCategory(value, operation.carrier, operation.category, input,
      state ?? createDestructuringPlannerState(sourceFile, input.program.source.ast), prelude, evaluation, selected.comparison);
    const expression = translateCsharpJsValueInvocation(input.scope.typeParameterNames, operation.operation, undefined, [value])
      ?? failCsharpPlannerInvariant("An admitted typeof expression requires its native runtime invocation.", node);
    return selected.comparison === undefined ? expression : { kind: "BinaryExpression", left: expression,
      operatorToken: { kind: selected.comparison.negated ? "ExclamationEqualsToken" : "EqualsEqualsToken" },
      right: { kind: "LiteralExpression", value: selected.comparison.runtimeKind } };
  });
}
