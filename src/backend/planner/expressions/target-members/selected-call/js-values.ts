import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import type { CsharpJsValueOperationSelection } from "../../../../../target-model/operations/js-values.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../../planned-values.js";
import {
  buildCsharpPlannedValue,
  captureCsharpPlannedValue,
  planCsharpOptionalReceiverValue,
} from "../../planned-value-composition.js";
import { translateCsharpJsValueInvocation } from "../../js-value-operations.js";
import { csharpStringTargetType } from "../../../../../target-model/types/index.js";

export function planCsharpJsValueCall(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  operation: Extract<CsharpJsValueOperationSelection, { readonly kind: "resolved" }>,
  source: ResolvedSourceCallInfo | undefined,
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const syntax = input.program.source.ast;
  const call = syntax.as.AsCallExpression(node);
  const access = source?.sourceCalleeAccess;
  const member = access?.kind === "property" || access?.kind === "element" ? access : undefined;
  const receiverNode = member?.receiver.expression ?? source?.sourceCallee.expression ?? call?.Expression;
  const sourceArguments = syntax.arguments(node);
  if (receiverNode === undefined || sourceArguments.some(argument => argument === undefined || syntax.is.IsSpreadElement(argument)) ||
      operation.presentOperation === undefined || member !== undefined && operation.receiverReadOperation === undefined ||
      member === undefined && operation.receiverReadOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A closed JS call requires its exact selected present invocation, member read and non-spread arguments."));
    return undefined;
  }
  const presentOperation = operation.presentOperation;
  const receiver = planExpression(receiverNode, sourceFile, input, diagnostics);
  const arguments_ = sourceArguments.map(argument => argument === undefined ? undefined :
    planExpression(argument, sourceFile, input, diagnostics));
  const optionalCall = call?.QuestionDotToken !== undefined &&
    !input.scope.presentOptionalValues?.has(source?.sourceCallee.expression ?? receiverNode);
  const invoke = (callee: CsharpPlannedValue, selectedReceiver?: CsharpExpression): CsharpPlannedValue | undefined => {
    const present = (selected: CsharpPlannedValue): CsharpPlannedValue | undefined =>
      buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [selected, ...arguments_], values =>
        translateCsharpJsValueInvocation(input.scope.typeParameterNames, presentOperation, values[0],
          [...(selectedReceiver === undefined ? [] : [selectedReceiver]), ...values.slice(1)]), presentOperation.resultType);
    return optionalCall ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, callee,
      value => present(csharpPlannedValue(callee.completion.carrier, value)), operation.resultType) : present(callee);
  };
  if (member === undefined) return receiver === undefined ? undefined : invoke(receiver);
  const readOperation = operation.receiverReadOperation;
  if (readOperation === undefined || receiver === undefined) return undefined;
  const name = member.kind === "property" ? syntax.as.AsPropertyAccessExpression(member.expression)?.name : undefined;
  if (member.kind === "property" && name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A closed member call requires its exact authored property name."));
    return undefined;
  }
  const key = member.kind === "element" ? planExpression(member.argument.expression, sourceFile, input, diagnostics)
    : csharpPlannedValue(csharpStringTargetType(), { kind: "LiteralExpression", value: syntax.text(name) });
  const read = (selected: CsharpPlannedValue, stableReceiver: CsharpExpression): CsharpPlannedValue | undefined => {
    const callee = buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [selected, key], values =>
      translateCsharpJsValueInvocation(input.scope.typeParameterNames, readOperation, values[0], [values[1]!]), readOperation.resultType);
    return callee === undefined ? undefined : invoke(callee, stableReceiver);
  };
  const accessSyntax = member.kind === "property" ? syntax.as.AsPropertyAccessExpression(member.expression)
    : syntax.as.AsElementAccessExpression(member.expression);
  const optionalReceiver = accessSyntax?.QuestionDotToken !== undefined && !input.scope.presentOptionalValues?.has(receiverNode);
  if (optionalReceiver) return planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver,
    value => read(csharpPlannedValue(receiver.completion.carrier, value), value), operation.resultType);
  if (receiver.completion.kind === "never") return receiver;
  if (receiver.completion.kind !== "value") return undefined;
  const capture = captureCsharpPlannedValue(node, input, diagnostics, receiver.completion.carrier);
  if (capture === undefined) return undefined;
  const reference: CsharpExpression = { kind: "IdentifierName", name: capture.name };
  return read(csharpPlannedValue(receiver.completion.carrier, reference, [...receiver.prelude,
    { kind: "LocalDeclarationStatement", name: capture.name, type: capture.type, initializer: receiver.completion.expression }]), reference);
}
