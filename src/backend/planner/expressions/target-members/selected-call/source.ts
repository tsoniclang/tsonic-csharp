import { applyCalleeTypeArguments } from "./helpers.js";
import { planCsharpUnionDispatcherCall } from "./union.js";
import { planCsharpSourceUndefinedValue } from "../../undefined-values.js";
import { translateCallArgument } from "./arguments.js";
import { failCsharpPlannerInvariant } from "../../../../invariants.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression } from "../../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { convertCsharpPlannedValue } from "../../planned-value-conversions.js";
import type { CsharpPlannedArgument, CsharpPlannedValue } from "../../planned-values.js";
import { csharpPlannedValue } from "../../planned-values.js";
import { composeCsharpPlannedValues, planCsharpExpressionCompletion, planCsharpOptionalReceiverValue } from "../../planned-value-composition.js";
import { composeCsharpPlannedCall, csharpPlannedArgumentSyntax, type CsharpPlannedCallArguments } from "./planned-arguments.js";
import { planCsharpNativeFunctionCallee, planCsharpNativeMethodCallee } from "./native-callees.js";
import type { DestructuringPlannerState } from "../../../bindings/binding-state.js";

export function translateSourceOwnedCall(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selected = input.program.records.sourceCallEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted source call requires its exact native invocation plan.", node);
  const arguments_ = translateSourceOwnedArguments(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
  if (arguments_ === undefined) return undefined;
  if (selected.kind === "union") {
    const receiver = planExpression(selected.union.receiver, sourceFile, input, diagnostics);
    return receiver === undefined ? undefined : composeCsharpPlannedCall(node, sourceFile, input, diagnostics, receiver, arguments_, (value, args) =>
      planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, planCsharpUnionDispatcherCall(node, value!, args, input, diagnostics), selected.union.resultType));
  }
  const callee = selected.callee;
  const optional = selected.optionalCallee !== undefined && !input.scope.presentOptionalValues?.has(selected.optionalCallee.expression) ? selected.optionalCallee : undefined;
  const invoke = (expression: CsharpExpression, args: readonly CsharpArgument[]): CsharpPlannedValue | undefined => {
    const member: CsharpExpression = selected.methodValue === undefined ? expression : { kind: "SimpleMemberAccessExpression", receiver: expression, name: selected.methodValue };
    const generic = applyCalleeTypeArguments(input.scope.typeParameterNames, member, selected.typeArguments, node, diagnostics);
    const invocation = generic === undefined ? undefined : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      { kind: "InvocationExpression", callee: generic, arguments: args }, selected.result.nativeType);
    return invocation === undefined ? undefined : convertCsharpPlannedValue(node, sourceFile, input, diagnostics, invocation, selected.result.selectedType, "explicit");
  };
  if (callee.kind === "function") {
    const expression = planCsharpNativeFunctionCallee(callee, sourceFile, input, diagnostics, state);
    return composeCsharpPlannedCall(node, sourceFile, input, diagnostics, undefined, arguments_, (_, args) => invoke(expression, args));
  }
  if (callee.kind === "method") {
    const method = planCsharpNativeMethodCallee(callee, sourceFile, input, diagnostics, planExpression);
    if (method?.kind === "type") return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, method.effect === undefined ? [] : [method.effect],
      () => composeCsharpPlannedCall(node, sourceFile, input, diagnostics, undefined, arguments_, (_, args) =>
        invoke({ kind: "SimpleMemberAccessExpression", receiver: method.receiver, name: method.name }, args)));
    return method === undefined ? undefined : composeCsharpPlannedCall(node, sourceFile, input, diagnostics, method.receiver, arguments_,
      (receiver, args) => invoke({ kind: "SimpleMemberAccessExpression", receiver: receiver!, name: method.name }, args));
  }
  const expression = planExpression(callee.expression, sourceFile, input, diagnostics);
  return optional === undefined ? expression === undefined ? undefined : composeCsharpPlannedCall(node, sourceFile, input, diagnostics, expression, arguments_, (value, args) => invoke(value!, args))
    : planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, expression, value => composeCsharpPlannedCall(node, sourceFile, input, diagnostics,
      csharpPlannedValue(optional.type, value), arguments_, (callable, args) => invoke(callable!, args)), selected.result.selectedType);
}

export function translateSourceOwnedArguments(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner): CsharpPlannedCallArguments | undefined {
  const selected = input.program.records.sourceArgumentsEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("Admitted source arguments require their exact native parameter grouping.", node);
  const planned: CsharpPlannedArgument[] = [];
  for (const entry of selected.arguments) {
    const argument = translateCallArgument(entry.node, entry.parameter, entry.form, sourceFile, input, diagnostics, planExpression, planCallArgument);
    if (argument === undefined) return undefined;
    planned.push(argument);
  }
  return { operands: planned, arguments: values => {
    const arguments_: CsharpArgument[] = [];
    for (const group of selected.groups) {
      if (group.kind === "collect") arguments_.push({ kind: "Argument", expression: { kind: "CollectionExpression", elements: group.arguments.map(argument => ({
        kind: argument.spread ? "SpreadElement" : "ExpressionElement", expression: values[argument.index]!,
      })) } });
      else if (group.kind === "value") arguments_.push(csharpPlannedArgumentSyntax(planned[group.index]!, values[group.index]!));
      else {
        arguments_.push({ kind: "Argument", expression: planCsharpSourceUndefinedValue(node, group, sourceFile, input, diagnostics) });
      }
    }
    return arguments_;
  } };
}
