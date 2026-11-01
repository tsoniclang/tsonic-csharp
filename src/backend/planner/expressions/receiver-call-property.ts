import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetPropertySelection } from "../../../target-model/records/operations/member-selections.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { translateCsharpSelectedReceiver } from "./receivers.js";
import { planCsharpExpressionCompletion, planCsharpOptionalReceiverValue, projectCsharpPlannedValue } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";

export function planCsharpReceiverCallProperty(
  node: Node,
  _selection: Extract<CsharpTargetPropertySelection, { readonly kind: "resolved" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const selected = input.program.records.receiverCallProperty.get(node)
    ?? failCsharpPlannerInvariant("An admitted computed property requires its exact native receiver-call relation.", node);
  const { selection } = selected;
  const member = selection.targetMember;
  const invocation = selection.invocation;
  if (invocation.kind !== "receiver-call") failCsharpPlannerInvariant("An admitted computed property requires its sealed receiver call.", node);
  const receiver = translateCsharpSelectedReceiver(selection.source.receiver, sourceFile, input, diagnostics,
    planExpression, input.program.records.selectedProperty.get(node)?.receiverProjection);
  if (receiver === undefined) return undefined;
  if (receiver.kind !== "value") failCsharpPlannerInvariant("An admitted receiver-call property requires a native receiver value.", node);
  const invoke = (value: CsharpExpression): CsharpExpression => ({ kind: "SimpleMemberAccessExpression",
    receiver: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: value,
      name: invocation.call.targetName }, arguments: [] }, name: member.targetName });
  return selection.source.optionalChain
    ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver.value,
        value => planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, invoke(value), readCsharpNativeExpressionCarrier(input, node)))
    : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver.value, invoke);
}
