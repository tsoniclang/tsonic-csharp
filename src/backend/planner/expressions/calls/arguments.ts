import { applyCsharpConversionSelection, readCsharpExpressionOperandStability } from "../conversions.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { planCsharpRestSequence } from "./rest-sequences.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import type { CsharpSelectedCallArgument, CsharpProviderArgumentMapping, CsharpCallArgumentProjection } from "../../../../target-model/records/objects/members.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../planning-data.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../planning-data.js";
import type { CsharpTargetParameter } from "../../../../target-model/types/model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlannedArgument, CsharpPlannedEffectOperand } from "../planned-values.js";
import { csharpPlannedValue, csharpPlannedEffect, mapCsharpPlannedValue } from "../planned-values.js";
import { composeCsharpPlannedValues, planCsharpOptionalReceiverValue, projectCsharpPlannedValue } from "../planned-value-composition.js";
import { captureCsharpPlannedValue } from "../value-captures.js";
import { planCsharpPlannedDiscard, planCsharpDiscardedOperand } from "../../statements/statement-output.js";
import { csharpPlannedArgumentSyntax, type CsharpPlannedCallArguments } from "./planned-arguments.js";
import { planCsharpCollectionElementRead } from "../collection-reads.js";
import { planCsharpSourceUndefinedValue } from "../undefined-values.js";
import { csharpVoidTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTargetArgumentOperand } from "../../../../target-model/records/calls/target-arguments.js";
import { planCsharpNativeDefault } from "./native-defaults.js";

export function translateSelectedTargetArguments(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner): CsharpPlannedCallArguments | undefined {
  const selected = input.program.records.targetArgumentsEmission.get(node);
  if (selected === undefined || selected.suspends.length !== selected.operands.length) {
    failCsharpPlannerInvariant("Admitted call arguments require their complete authored evaluation and Native binding plan.", node);
  }
  const operands: (CsharpPlannedArgument | CsharpPlannedEffectOperand)[] = [];
  const bindings: ({ readonly argument: CsharpPlannedArgument; readonly index: number } |
    { readonly argument: CsharpPlannedArgument; readonly expression: CsharpExpression } | undefined)[] =
    Array.from({ length: selected.bindings.length }, () => undefined);
  let valueIndex = 0;
  for (const [index, entry] of selected.operands.entries()) {
    if (entry.kind === "discard") {
      const planned = planExpression(entry.expression, sourceFile, input, diagnostics);
      if (planned === undefined) return undefined;
      operands.push({ kind: "effect", effect: { ...csharpPlannedEffect(csharpVoidTargetType(), planCsharpPlannedDiscard(planned),
        planned.completion.kind === "never" ? "never" : "void"), ...(selected.suspends[index] ? { suspends: true as const } : {}) } });
      continue;
    }
    if (entry.kind === "expanded") {
      const expanded = planExpandedArgument(entry, sourceFile, input, diagnostics, planExpression);
      if (expanded === undefined) return undefined;
      operands.push({ kind: "effect", effect: { ...expanded.effect, ...(selected.suspends[index] ? { suspends: true as const } : {}) } });
      for (const value of expanded.values) {
        if (bindings[value.binding] !== undefined) failCsharpPlannerInvariant("A Native parameter binding has one authored producer.", node);
        bindings[value.binding] = { argument: csharpPlannedValue(value.type, value.expression), expression: value.expression };
      }
      continue;
    }
    const planned = entry.kind === "projection" ? planProjectedArgument(entry.projection, sourceFile, input, diagnostics, planExpression)
      : entry.kind === "sequence" ? planCsharpRestSequence(entry.sequence, sourceFile, input, diagnostics, planExpression)
        : translateCallArgument(entry.expression, entry.parameter, entry.form, sourceFile, input, diagnostics, planExpression, planCallArgument, entry.mapping);
    if (planned === undefined) return undefined;
    const argument: CsharpPlannedArgument = { ...planned, ...(selected.suspends[index] ? { suspends: true as const } : {}) };
    operands.push(argument);
    if (bindings[entry.binding] !== undefined) failCsharpPlannerInvariant("A Native parameter binding has one authored producer.", node);
    bindings[entry.binding] = { argument, index: valueIndex++ };
  }
  const groups = selected.groups.map(group => {
    if (group.kind !== "absence") return group;
    const prelude: CsharpStatement[] = [];
    const expression = planCsharpSourceUndefinedValue(node, group, sourceFile, input, diagnostics, prelude);
    const binding = bindings.length;
    const argument = csharpPlannedValue(group.type, expression, prelude, true, true);
    operands.push(argument);
    bindings.push({ argument, index: valueIndex++ });
    return { kind: "value" as const, index: binding };
  });
  return { operands, ...(selected.reordered ? { reordered: true as const } : {}), arguments: values => {
    const binding = (index: number): CsharpArgument => {
      const selected = bindings[index] ?? failCsharpPlannerInvariant("Every Native argument requires its completed authored evaluation.", node);
      const expression = "expression" in selected ? selected.expression
        : values[selected.index] ?? failCsharpPlannerInvariant("A Native argument lost its original ordered evaluation result.", node);
      return csharpPlannedArgumentSyntax(selected.argument, expression);
    };
    return groups.map((group, index): CsharpArgument => {
      if (group.kind === "value") return binding(group.index);
      if (group.kind === "native-default") return { kind: "Argument", expression: planCsharpNativeDefault(group, input.scope.typeParameterNames) };
      const expression: CsharpExpression = { kind: "CollectionExpression", elements: group.arguments.map(entry => ({
        kind: entry.spread ? "SpreadElement" : "ExpressionElement", expression: binding(entry.index).expression,
      })) };
      const native = input.program.records.targetCallEmission.get(node);
      if (native === undefined) return { kind: "Argument", expression };
      const carrier = native.selection.targetMember.parameters[index]?.type
        ?? failCsharpPlannerInvariant("A sealed Native collection argument retains its exact physical parameter slot.", node);
      const type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames)
        ?? failCsharpPlannerInvariant("A sealed Native collection argument requires its admitted physical array type.", node);
      return { kind: "Argument", expression: { kind: "CastExpression", type, expression } };
    });
  } };
}

function planExpandedArgument(
  selected: Extract<CsharpTargetArgumentOperand, { readonly kind: "expanded" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
) {
  const planned = planExpression(selected.expression, sourceFile, input, diagnostics);
  if (planned === undefined) return undefined;
  if (planned.completion.kind !== "value" || !targetTypeRefEquals(planned.completion.carrier, selected.carrier)) {
    failCsharpPlannerInvariant("An expanded call argument requires the exact admitted Native aggregate value.", selected.expression);
  }
  const prelude: CsharpStatement[] = [...planned.prelude];
  let receiver = planned.completion.expression;
  if (selected.values.length > 1) {
    const captured = captureCsharpPlannedValue(selected.expression, input, selected.carrier)
      ?? failCsharpPlannerInvariant("An expanded argument requires its exact once-only aggregate capture.", selected.expression);
    prelude.push({ kind: "LocalDeclarationStatement", ...captured, initializer: receiver });
    receiver = { kind: "IdentifierName", name: captured.name };
  }
  const values: { readonly binding: number; readonly expression: CsharpExpression; readonly type: import("../../../../target-model/types/native-type-data.js").TargetTypeRef }[] = [];
  for (const selectedValue of selected.values) {
    const read = selectedValue.read;
    const value: CsharpExpression | undefined = read.kind === "value" ? receiver : read.kind === "tuple"
      ? { kind: "SimpleMemberAccessExpression", receiver, name: read.name }
      : planCsharpCollectionElementRead(selected.carrier, receiver, { kind: "LiteralExpression", value: read.index }, input);
    const converted = applyCsharpConversionSelection(selected.expression, sourceFile, input, diagnostics,
      selectedValue.source, selectedValue.target, selectedValue.conversion, value, prelude, "snapshot");
    if (converted === undefined) return undefined;
    const captured = captureCsharpPlannedValue(selected.expression, input, selectedValue.target)
      ?? failCsharpPlannerInvariant("An expanded Native argument requires its exact parameter snapshot.", selected.expression);
    prelude.push({ kind: "LocalDeclarationStatement", ...captured, initializer: converted });
    values.push({ binding: selectedValue.binding, expression: { kind: "IdentifierName", name: captured.name }, type: selectedValue.target });
  }
  return { effect: csharpPlannedEffect(csharpVoidTargetType(), prelude), values };
}

export function planProjectedArgument(
  projection: CsharpCallArgumentProjection,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedArgument | undefined {
  const operands = projection.values.map((value, index) => {
    let planned = planExpression(value.expression, sourceFile, input, diagnostics);
    if (value.member !== undefined) {
      const member = value.member;
      const read = (receiver: CsharpExpression) => csharpPlannedValue(member.type,
        { kind: "SimpleMemberAccessExpression", receiver, name: member.targetName });
      planned = value.optional ? planCsharpOptionalReceiverValue(value.expression, sourceFile, input, diagnostics, planned,
        read, projection.target) : projectCsharpPlannedValue(value.expression, sourceFile, input, diagnostics, planned,
          receiver => ({ kind: "SimpleMemberAccessExpression", receiver, name: member.targetName }), member.type);
    }
    return index === projection.resultIndex ? planned : planCsharpDiscardedOperand(planned);
  });
  return composeCsharpPlannedValues(projection.source, sourceFile, input, diagnostics, operands, expressions =>
    csharpPlannedValue(projection.target, projection.resultIndex === undefined ? { kind: "LiteralExpression", value: null }
      : expressions[0] ?? failCsharpPlannerInvariant("A native member argument requires its selected projection value.", projection.source),
    [], projection.resultIndex === undefined, projection.resultIndex === undefined));
}

export function translateCallArgument(expression: Node, parameter: CsharpTargetParameter, sourceForm: CsharpSelectedCallArgument["sourceForm"],
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner, mapping?: CsharpProviderArgumentMapping): CsharpPlannedArgument | undefined {
  const selected = input.program.records.callArgumentEmission.get(expression, parameter, sourceForm, mapping);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted call argument requires its exact parameter-specific native adaptation.", expression);
  if (selected.kind === "plain") return planCallArgument(expression, sourceFile, input, diagnostics, selected.target, parameter.passingMode, parameter);
  if (selected.kind === "native-binding") {
    const value = planCallArgument(expression, sourceFile, input, diagnostics, selected.source, "by-value");
    const type = csharpTypeFromTargetTypeRef(selected.source, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("A nominal native argument requires its sealed delegate carrier.", expression);
    return value === undefined ? undefined : { ...value, nativeBinding: type };
  }
  if (selected.kind === "convert") {
    const source = selected.read === "expression" ? planExpression(expression, sourceFile, input, diagnostics) :
      planCallArgument(expression, sourceFile, input, diagnostics, selected.source, "by-value");
    return mapCsharpPlannedValue(source, selected.target, (value, prelude) => applyCsharpConversionSelection(expression, sourceFile, input, diagnostics,
      selected.source, selected.target, selected.conversion, value, prelude, readCsharpExpressionOperandStability(expression, input, selected.source, selected.target, "implicit", selected.conversion), source?.absent === true, source?.callable));
  }
  const source = planCallArgument(expression, sourceFile, input, diagnostics, selected.source, "by-value");
  if (source === undefined || source.completion.kind === "never") return source;
  if (source.completion.kind !== "value") failCsharpPlannerInvariant("An admitted argument-vector adapter requires its exact source callable value.", expression);
  const callable = csharpTypeFromTargetTypeRef(selected.source, input.scope.typeParameterNames);
  const vector = csharpTypeFromTargetTypeRef(selected.vector, input.scope.typeParameterNames);
  if (callable === undefined || vector === undefined) failCsharpPlannerInvariant("An admitted argument-vector adapter requires its native callable and vector types.", expression);
  const capture = captureCsharpPlannedValue(expression, input, selected.source);
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
