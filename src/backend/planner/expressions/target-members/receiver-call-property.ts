import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetPropertySelection } from "../../../../analysis/operations/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import type { CsharpExpression } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { translateCsharpSelectedReceiver } from "../receivers.js";
import { planCsharpExpressionCompletion, planCsharpOptionalReceiverValue, projectCsharpPlannedValue } from "../planned-value-composition.js";

export function planCsharpReceiverCallProperty(
  node: Node,
  selection: Extract<CsharpTargetPropertySelection, { readonly kind: "resolved" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const member = selection.targetMember;
  const parameter = member.parameters[0];
  const type = member.declaringType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(member.declaringType, input.scope.typeParameterNames);
  if (selection.invocation.kind !== "receiver-call" || member.kind !== "method" || member.static !== true ||
      (member.typeParameters?.length ?? 0) !== 0 ||
      member.returnType === undefined || type === undefined || member.parameters.length !== 1 ||
      parameter?.passingMode !== "by-value" || parameter.optional === true || parameter.paramsArray === true ||
      selection.receiver.kind !== "target-parameter" || selection.receiver.targetParameterIndex !== 0 ||
      selection.source.accessMode !== "read") {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "A computed native property requires its exact read-only static receiver-call relation."));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(selection.source.receiver, sourceFile, input, diagnostics,
    planExpression, input.program.operations.property(node)?.receiverProjection);
  const invoke = (value: CsharpExpression): CsharpExpression => ({
    kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: member.targetName },
    arguments: [{ kind: "Argument", expression: value }],
  });
  return selection.source.optionalChain
    ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver,
        value => planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, invoke(value)))
    : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, invoke);
}
