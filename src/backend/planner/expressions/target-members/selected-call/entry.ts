import { failCsharpPlannerInvariant } from "../../../../invariants.js";
import { planCsharpJsValueCall } from "./js-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue } from "../../planned-value-composition.js";
import type { CsharpPlannedValue } from "../../planned-values.js";
import { translateSelectedTargetCall } from "./target.js";
import { translateSourceOwnedCall } from "./source.js";
import { planCsharpOptionalReceiverChain } from "./optional-chain.js";
import { planCsharpClosedTypeTest } from "../../type-tests.js";
import { createDestructuringPlannerState, type DestructuringPlannerState } from "../../../bindings/binding-state.js";
import { convertCsharpPlannedValue } from "../../planned-value-conversions.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function translateCsharpCallExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner,
  state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const optional = planCsharpOptionalReceiverChain(node, sourceFile, input, diagnostics, planExpression, planCallArgument,
    (call, context, expressions, arguments_) => translateCsharpCallExpressionCore(call, sourceFile, context, diagnostics, expressions, arguments_, state));
  return optional.handled ? optional.expression : translateCsharpCallExpressionCore(node, sourceFile, input, diagnostics, planExpression, planCallArgument, state);
}

function translateCsharpCallExpressionCore(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner,
  state: DestructuringPlannerState | undefined): CsharpPlannedValue | undefined {
  const classification = input.program.records.selectedCall.get(node)
    ?? failCsharpPlannerInvariant("An admitted call requires its exact native classification.", node);
  const form = classification.form;
  if (form.kind === "type-test") {
    const argument = classification.source?.sourceArguments[0];
    if (argument === undefined) failCsharpPlannerInvariant("An admitted array predicate requires its exact native argument.", node);
    const value = planCallArgument(argument.expression, sourceFile, input, diagnostics, form.typeTest.sourceCarrier);
    return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
      selected => planCsharpClosedTypeTest(selected, form.typeTest, input, createDestructuringPlannerState(sourceFile, input.program.source.ast)));
  }
  if (form.kind === "keep-alive") {
    const value = planExpression(form.sourceFlow.valueExpression, sourceFile, input, diagnostics);
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [value], values => ({ kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: { kind: "AliasQualifiedName", alias: "global", name: {
        kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "GC" } }, name: "KeepAlive" },
      arguments: [{ kind: "Argument", expression: values[0]! }] }));
  }
  if (form.kind === "js-value") return planCsharpJsValueCall(node, sourceFile, input, diagnostics, planExpression);
  const selection = classification.target;
  if (selection === undefined) failCsharpPlannerInvariant("An admitted target call requires its selected native invocation.", node);
  if (selection.kind === "source-owned") return translateSourceOwnedCall(node, sourceFile, input, diagnostics, planExpression, planCallArgument, state);
  const invocation = translateSelectedTargetCall(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
  return invocation === undefined || classification.sourceResult === undefined ? invocation
    : convertCsharpPlannedValue(node, sourceFile, input, diagnostics, invocation, classification.sourceResult.selectedType, "explicit");
}
