import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { isCsharpValueTypeTargetType, resolveCsharpObjectShapeMemberBySelectedSubject, type TargetTypeRef } from "../../policy/types/index.js";
import { isCsharpRefusal } from "../../representation/index.js";
import { selectCsharpTypedLocationStorage } from "../storage/typed-locations.js";
import { type CsharpTypedLocationStorageSelection } from "../../target-model/records/storage/typed-location-storage.js";

/** The Host member or element selection of an access: its receiver, access mode and selected declarations. */
function selectedMember(policy: CsharpPolicyContext, node: Node):
  { readonly receiver: Node; readonly access: string; readonly declarations: readonly Node[] } | undefined {
  if (policy.ast.is.IsElementAccessExpression(node)) {
    const element = policy.facts.values.elementAccess(node);
    const declarations = element.selected.kind === "member" || element.selected.kind === "index-signature" ? [element.selected.declaration] : [];
    return { receiver: element.receiver, access: element.access, declarations };
  }
  const member = policy.facts.selections.memberAccess(node);
  if (member === undefined) return undefined;
  return { receiver: member.receiver, access: member.access,
    declarations: member.selected.kind === "member" ? member.selected.declarations : [member.selected.declaration] };
}

export function classifyCsharpBoundFieldWrite(
  policy: CsharpPolicyContext,
  expression: Node,
  valueType: TargetTypeRef | undefined,
): CsharpTypedLocationStorageSelection | undefined {
  const source = selectedMember(policy, expression);
  if (source === undefined || (source.access !== "write" && source.access !== "read-write")) return undefined;
  let receiver = source.receiver;
  while (policy.ast.is.IsPropertyAccessExpression(receiver) || policy.ast.is.IsElementAccessExpression(receiver)) {
    const type = policy.types.readStorage(receiver);
    if (isCsharpRefusal(type) || !isCsharpValueTypeTargetType(type)) return undefined;
    const selected = selectedMember(policy, receiver);
    if (selected === undefined) return undefined;
    const shape = policy.objectShapes.resolveNode(selected.receiver);
    const field = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape, selected.declarations);
    if (field?.kind === "resolved" && field.member.bound === true) {
      return valueType === undefined
        ? { kind: "rejected", reason: "A bound value-field write requires its exact C# storage type." }
        : selectCsharpTypedLocationStorage(policy, expression, valueType, new WeakSet(),
            source.declarations.length === 1 ? source.declarations[0] : undefined);
    }
    receiver = selected.receiver;
  }
  return undefined;
}
