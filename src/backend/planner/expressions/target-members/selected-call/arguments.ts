import { applyCsharpConversionSelection } from "../../conversions.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { planCsharpRestSequence } from "./rest-sequences.js";
import { failCsharpPlannerInvariant } from "../../../../invariants.js";
import type { CsharpSelectedCallArgument, CsharpProviderArgumentMapping } from "../../../../../target-model/records/members.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression } from "../../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpTargetParameter } from "../../../../../target-model/types/model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlannedArgument } from "../../planned-values.js";
import { csharpPlannedValue, mapCsharpPlannedValue } from "../../planned-values.js";
import { captureCsharpPlannedValue } from "../../planned-value-composition.js";
import { csharpPlannedArgumentSyntax, type CsharpPlannedCallArguments } from "./planned-arguments.js";

export function translateSelectedTargetArguments(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner): CsharpPlannedCallArguments | undefined {
  const selected = input.program.records.targetArgumentsEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("Admitted target arguments require their exact source order and native positional plan.", node);
  const operands: CsharpPlannedArgument[] = [];
  for (const entry of selected.operands) {
    const argument = entry.kind === "sequence" ? planCsharpRestSequence(entry.sequence, sourceFile, input, diagnostics, planExpression) :
      translateCallArgument(entry.expression, entry.parameter, entry.form, sourceFile, input, diagnostics, planExpression, planCallArgument, entry.mapping);
    if (argument === undefined) return undefined;
    operands.push(argument);
  }
  return { operands, ...(selected.reordered ? { reordered: true as const } : {}), arguments: values => selected.groups.map(group => {
    const first = group.arguments[0] ?? failCsharpPlannerInvariant("An admitted target argument group requires its native operand.", node);
    return !group.collect ? csharpPlannedArgumentSyntax(operands[first.index]!, values[first.index]!) : {
      kind: "Argument", expression: { kind: "CollectionExpression", elements: group.arguments.map(argument => ({
        kind: argument.spread ? "SpreadElement" : "ExpressionElement", expression: values[argument.index]!,
      })) },
    };
  }) };
}

export function translateCallArgument(expression: Node, parameter: CsharpTargetParameter, sourceForm: CsharpSelectedCallArgument["sourceForm"],
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner, mapping?: CsharpProviderArgumentMapping): CsharpPlannedArgument | undefined {
  const selected = input.program.records.callArgumentEmission.get(expression, parameter, sourceForm, mapping);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted call argument requires its exact parameter-specific native adaptation.", expression);
  if (selected.kind === "plain") return planCallArgument(expression, sourceFile, input, diagnostics, selected.target, parameter.passingMode, parameter);
  if (selected.kind === "convert") {
    const source = selected.read === "expression" ? planExpression(expression, sourceFile, input, diagnostics) :
      planCallArgument(expression, sourceFile, input, diagnostics, selected.source, "by-value");
    return mapCsharpPlannedValue(source, selected.target, value => applyCsharpConversionSelection(expression, sourceFile, input, diagnostics,
      selected.source, selected.target, selected.conversion, value));
  }
  const source = planCallArgument(expression, sourceFile, input, diagnostics, selected.source, "by-value");
  if (source === undefined || source.completion.kind === "never") return source;
  if (source.completion.kind !== "value") failCsharpPlannerInvariant("An admitted argument-vector adapter requires its exact source callable value.", expression);
  const callable = csharpTypeFromTargetTypeRef(selected.source, input.scope.typeParameterNames);
  const vector = csharpTypeFromTargetTypeRef(selected.vector, input.scope.typeParameterNames);
  if (callable === undefined || vector === undefined) failCsharpPlannerInvariant("An admitted argument-vector adapter requires its native callable and vector types.", expression);
  const capture = captureCsharpPlannedValue(expression, input, diagnostics, selected.source);
  if (capture === undefined) failCsharpPlannerInvariant("An admitted argument-vector adapter requires its exact native callable capture.", expression);
  const name = input.names.temporaryName(`__tsonic_ecmascriptArguments_${input.program.source.ast.pos(expression)}`);
  const receiver: CsharpExpression = { kind: "IdentifierName", name };
  const arguments_: CsharpArgument[] = selected.parameters.map((parameter, index) => {
    const type = csharpTypeFromTargetTypeRef(parameter.type, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted callback argument requires its exact native payload type.", expression);
    return { kind: "Argument", expression: { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver, name: parameter.rest ? "Rest" : "Get", typeArguments: [type] },
      arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: index } }] } };
  });
  return csharpPlannedValue(selected.target, { kind: "LambdaExpression", parameters: [{ kind: "Parameter", name, type: vector }],
    body: { kind: "InvocationExpression", callee: { kind: "ParenthesizedExpression", expression: { kind: "CastExpression", type: callable,
      expression: { kind: "IdentifierName", name: capture.name } } }, arguments: arguments_ } },
    [...source.prelude, { kind: "LocalDeclarationStatement", ...capture, initializer: source.completion.expression }]);
}
