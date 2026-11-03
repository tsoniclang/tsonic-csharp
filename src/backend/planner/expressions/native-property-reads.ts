import type { Node } from "@tsonic/tsts";
import type { CsharpNativePropertyRead } from "../../../target-model/records/program/source-profile-invocations.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planNativePropertyRead(
  property: CsharpNativePropertyRead,
  receiver: CsharpExpression,
  node: Node,
): CsharpExpression {
  if (property.invocation.kind === "member" && property.receiver.kind === "instance") {
    return { kind: "SimpleMemberAccessExpression", receiver, name: property.member.targetName };
  }
  if (property.invocation.kind !== "receiver-call" || property.receiver.kind !== "instance") {
    return failCsharpPlannerInvariant("An admitted native binding requires its sealed receiver relation.", node);
  }
  return { kind: "SimpleMemberAccessExpression", receiver: { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver, name: property.invocation.call.targetName }, arguments: [] },
    name: property.member.targetName };
}
