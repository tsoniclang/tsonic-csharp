import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "./expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { CsharpPlanningContext } from "../context.js";
import { translateSelectedTargetArguments, translateSourceOwnedArguments } from "./calls/selected-call.js";
import { renderSelectedCsharpTargetMethodTypeArguments } from "./selected-method-type-arguments.js";
import { translateCsharpJsValueInvocation } from "./js-value-operations.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { composeCsharpPlannedCall } from "./calls/planned-arguments.js";

export function translateCsharpConstruction(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.constructionEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted construction requires its exact sealed native plan.", node);
  if (selected.kind === "js-value") {
    const callee = planExpression(selected.callee, sourceFile, input, diagnostics);
    const arguments_ = selected.arguments.map(argument => planExpression(argument, sourceFile, input, diagnostics));
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [callee, ...arguments_], values =>
      translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.operation, values[0]!, values.slice(1)), selected.result);
  }
  const arguments_ = selected.kind === "native" ? translateSelectedTargetArguments(node, sourceFile, input, diagnostics, planExpression, planCallArgument) :
    translateSourceOwnedArguments(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
  if (arguments_ === undefined) return undefined;
  if (selected.kind === "native") {
    const owner = csharpTypeFromTargetTypeRef(selected.owner, input.scope.typeParameterNames);
    if (owner === undefined) failCsharpPlannerInvariant("An admitted constructor requires its exact native declaring or factory type.", node);
    return composeCsharpPlannedCall(node, sourceFile, input, diagnostics, undefined, arguments_, (_, args) => {
      let value: CsharpExpression;
      const invocation = selected.invocation;
      if (invocation.kind === "factory") {
        const typeArguments = renderSelectedCsharpTargetMethodTypeArguments(selected.selection, node, sourceFile, input, diagnostics);
        value = { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: selected.selection.targetMember.targetName,
          ...(typeArguments.length === 0 ? {} : { typeArguments }) }, arguments: args };
      } else value = { kind: "ObjectCreationExpression", type: owner, arguments: invocation.kind === "module" ? args.map((argument, index) =>
        index === invocation.index ? { ...argument, expression: { kind: "LiteralExpression", value: invocation.entry } } : argument) : args };
      return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, value, selected.result);
    });
  }
  const invocation = selected.invocation;
  if (invocation.kind === "constructor") {
    const owner = csharpTypeFromTargetTypeRef(invocation.owner, input.scope.typeParameterNames);
    if (owner === undefined) failCsharpPlannerInvariant("An admitted source constructor requires its exact native result type.", node);
    return composeCsharpPlannedCall(node, sourceFile, input, diagnostics, undefined, arguments_, (_, args) =>
      planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, { kind: "ObjectCreationExpression", type: owner, arguments: args }, selected.result));
  }
  const callee = planExpression(invocation.callee, sourceFile, input, diagnostics);
  if (callee === undefined) return undefined;
  return composeCsharpPlannedCall(node, sourceFile, input, diagnostics, callee, arguments_, (value, args) => {
    const typeArguments = invocation.kind !== "factory" ? [] : invocation.arguments.map(carrier => csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames) ??
      failCsharpPlannerInvariant("An admitted generic class factory requires its exact native type arguments.", node));
    return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, { kind: "InvocationExpression",
      callee: invocation.kind === "delegate" ? value! : { kind: "SimpleMemberAccessExpression", receiver: value!, name: invocation.method,
        ...(typeArguments.length === 0 ? {} : { typeArguments }) }, arguments: args }, selected.result);
  });
}
