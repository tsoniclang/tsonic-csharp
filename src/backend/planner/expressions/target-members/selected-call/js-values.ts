import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpExpression } from "../../../../target-ast/syntax/index.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../planned-values.js";
import { buildCsharpPlannedValue, captureCsharpPlannedValue, planCsharpOptionalReceiverValue } from "../../planned-value-composition.js";
import { translateCsharpJsValueInvocation } from "../../js-value-operations.js";
import { failCsharpPlannerInvariant } from "../../../../invariants.js";

export function planCsharpJsValueCall(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.jsCall.get(node)
    ?? failCsharpPlannerInvariant("An admitted JS call requires its exact native invocation and member-read plan.", node);
  const { operation, present: presentOperation, member } = selected;
  const receiver = planExpression(selected.receiver, sourceFile, input, diagnostics);
  const arguments_ = selected.arguments.map(argument => planExpression(argument, sourceFile, input, diagnostics));
  const optionalCall = selected.optionalCall && !input.scope.presentOptionalValues?.has(selected.callSubject);
  const invoke = (callee: CsharpPlannedValue, selectedReceiver?: CsharpExpression): CsharpPlannedValue | undefined => {
    const present = (value: CsharpPlannedValue): CsharpPlannedValue | undefined => buildCsharpPlannedValue(node, sourceFile, input, diagnostics,
      [value, ...arguments_], values => translateCsharpJsValueInvocation(input.scope.typeParameterNames, presentOperation, values[0],
        [...(selectedReceiver === undefined ? [] : [selectedReceiver]), ...values.slice(1)]), presentOperation.resultType);
    return optionalCall ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, callee,
      value => present(csharpPlannedValue(callee.completion.carrier, value)), operation.resultType) : present(callee);
  };
  if (receiver === undefined) return undefined;
  if (member === undefined) return invoke(receiver);
  const key = member.key.kind === "expression" ? planExpression(member.key.expression, sourceFile, input, diagnostics)
    : csharpPlannedValue(member.key.carrier, { kind: "LiteralExpression", value: member.key.value });
  const read = (value: CsharpPlannedValue, stableReceiver: CsharpExpression): CsharpPlannedValue | undefined => {
    const callee = buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [value, key], values =>
      translateCsharpJsValueInvocation(input.scope.typeParameterNames, member.read, values[0], [values[1]!]), member.read.resultType);
    return callee === undefined ? undefined : invoke(callee, stableReceiver);
  };
  if (member.optional && !input.scope.presentOptionalValues?.has(selected.receiver)) return planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver,
    value => read(csharpPlannedValue(receiver.completion.carrier, value), value), operation.resultType);
  if (receiver.completion.kind === "never") return receiver;
  if (receiver.completion.kind !== "value") failCsharpPlannerInvariant("An admitted JS call receiver requires its native value completion.", selected.receiver);
  const capture = captureCsharpPlannedValue(node, input, receiver.completion.carrier);
  if (capture === undefined) return undefined;
  const reference: CsharpExpression = { kind: "IdentifierName", name: capture.name };
  return read(csharpPlannedValue(receiver.completion.carrier, reference, [...receiver.prelude,
    { kind: "LocalDeclarationStatement", name: capture.name, type: capture.type, initializer: receiver.completion.expression }]), reference);
}
