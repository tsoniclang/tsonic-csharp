import { applyCalleeTypeArguments } from "./helpers.js";
import { planCsharpUnionDispatcherCall } from "./union.js";
import { translateSelectedTargetArguments } from "./arguments.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../planning-data.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../planning-data.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { convertCsharpPlannedValue } from "../planned-value-conversions.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { csharpPlannedValue } from "../planned-values.js";
import { composeCsharpPlannedValues, planCsharpOptionalReceiverValue } from "../planned-value-composition.js";
import { planCsharpExpressionCompletion } from "../expression-completions.js";
import { composeCsharpPlannedCall } from "./planned-arguments.js";
import { planCsharpNativeFunctionCallee, planCsharpNativeMethodCallee } from "./native-callees.js";
import type { DestructuringPlannerState } from "../../planning-data.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { castCsharpCallableOperand, unparenthesizeCsharpExpression } from "./callable-syntax.js";
import { planCsharpPlannedDiscard } from "../../statements/statement-output.js";

export function translateSourceOwnedCall(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner, state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  const selected = input.program.records.sourceCallEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted source call requires its exact native invocation plan.", node);
  if (selected.kind === "skipped") {
    const callee = planExpression(selected.callee, sourceFile, input, diagnostics, state);
    if (callee === undefined || callee.completion.kind === "never") return callee;
    return csharpPlannedValue(selected.result, { kind: "LiteralExpression", value: null }, planCsharpPlannedDiscard(callee), true, true);
  }
  const arguments_ = translateSelectedTargetArguments(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
  if (arguments_ === undefined) return undefined;
  if (selected.kind === "union") {
    const receiver = planExpression(selected.union.receiver, sourceFile, input, diagnostics);
    return receiver === undefined ? undefined : composeCsharpPlannedCall(node, sourceFile, input, diagnostics, receiver, arguments_, (value, args) =>
      planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, planCsharpUnionDispatcherCall(node, value!, args, input, diagnostics), selected.union.resultType));
  }
  const callee = selected.callee;
  const optional = selected.optionalCallee !== undefined && !input.scope.presentOptionalValues?.has(selected.optionalCallee.expression) ? selected.optionalCallee : undefined;
  const invoke = (expression: CsharpExpression, args: readonly CsharpArgument[]): CsharpPlannedValue | undefined => {
    const member: CsharpExpression = callee.kind !== "value" ? expression : { kind: "SimpleMemberAccessExpression", receiver: expression, name: selected.member.name };
    const generic = applyCalleeTypeArguments(input.scope.typeParameterNames, member, selected.typeArguments, node, diagnostics);
    const invocation = generic === undefined ? undefined : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      { kind: "InvocationExpression", callee: generic, arguments: args }, selected.result.nativeType);
    if (invocation === undefined) return undefined;
    return convertCsharpPlannedValue(node, sourceFile, input, diagnostics, invocation, selected.result.selectedType, "explicit");
  };
  if (callee.kind === "function") {
    const prelude: CsharpStatement[] = [];
    const expression = planCsharpNativeFunctionCallee(callee, sourceFile, input, diagnostics, prelude, state);
    const call = composeCsharpPlannedCall(node, sourceFile, input, diagnostics, undefined, arguments_, (_, args) => invoke(expression, args));
    return call === undefined ? undefined : { ...call, prelude: [...prelude, ...call.prelude] };
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
  const invokeValue = (value: CsharpExpression, args: readonly CsharpArgument[]): CsharpPlannedValue | undefined => {
    const operand = unparenthesizeCsharpExpression(value);
    if (operand.kind !== "LambdaExpression") return invoke(value, args);
    const type = expression?.completion.kind === "value"
      ? csharpTypeFromTargetTypeRef(expression.completion.carrier, input.scope.typeParameterNames) : undefined;
    if (type === undefined) failCsharpPlannerInvariant("An immediately invoked native lambda requires its completed callable carrier.", node);
    return invoke(castCsharpCallableOperand(operand, type), args);
  };
  return optional === undefined ? expression === undefined ? undefined : composeCsharpPlannedCall(node, sourceFile, input, diagnostics, expression, arguments_, (value, args) => invokeValue(value!, args))
    : planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, expression, value => composeCsharpPlannedCall(node, sourceFile, input, diagnostics,
      csharpPlannedValue(optional.type, value), arguments_, (callable, args) => invokeValue(callable!, args)), selected.result.selectedType);
}
