import type { Node } from "@tsonic/tsts";
import type { CsharpNativeBindingProperty } from "../../../target-model/records/objects/value-projections.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";

export function planNativeBindingProperty(
  property: CsharpNativeBindingProperty,
  receiver: CsharpExpression,
  node: Node,
  input: CsharpPlanningContext,
): CsharpExpression {
  if (property.invocation.kind === "member" && property.receiver.kind === "instance") {
    return { kind: "SimpleMemberAccessExpression", receiver, name: property.member.targetName };
  }
  if (property.invocation.kind !== "receiver-call" || property.receiver.kind !== "target-parameter" ||
      property.receiver.targetParameterIndex !== 0 || property.member.declaringType === undefined) {
    return failCsharpPlannerInvariant("An admitted native binding requires its sealed receiver relation.", node);
  }
  const owner = csharpTypeFromTargetTypeRef(property.member.declaringType, input.scope.typeParameterNames);
  if (owner === undefined) return failCsharpPlannerInvariant("An admitted native binding requires its renderable owner.", node);
  return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner,
    name: property.member.targetName }, arguments: [{ kind: "Argument", expression: receiver }] };
}
