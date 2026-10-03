import type { CsharpTargetMember, CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { getCsharpReadOnlyIndexableCollectionElementTargetType } from "./collections.js";
import { targetTypeRefEquals } from "./equality.js";

export type CsharpCollectionElementRead =
  | { readonly kind: "indexer"; readonly element: TargetTypeRef }
  | { readonly kind: "method"; readonly element: TargetTypeRef; readonly member: CsharpTargetMember }
  | { readonly kind: "invalid"; readonly reason: string };

export function selectCsharpCollectionElementRead(carrier: TargetTypeRef): CsharpCollectionElementRead | undefined {
  const element = getCsharpReadOnlyIndexableCollectionElementTargetType(carrier);
  const member = carrier.kind === "target-named" ? (carrier as CsharpTargetNamedTypeRef).csharpIndexableReadMember : undefined;
  if (element === undefined) return member === undefined ? undefined : invalid();
  if (member === undefined) return { kind: "indexer", element };
  const receiver = member.parameters[0];
  const index = member.parameters[1];
  if (member.kind !== "method" || member.static !== true || member.readonly !== true ||
    member.declaringType === undefined || member.declaringType.kind !== "target-named" ||
    member.targetName.length === 0 || member.id.length === 0 || member.parameters.length !== 2 ||
    member.typeParameters !== undefined && member.typeParameters.length !== 0 ||
    member.csharpInvocation !== undefined || member.csharpReturnPassing !== undefined ||
    receiver === undefined || index === undefined ||
    !targetTypeRefEquals(receiver.type, carrier) ||
    receiver.passingMode !== "by-value" && receiver.passingMode !== "byref-readonly" ||
    index.type.kind !== "source-primitive" || index.type.name !== "int32" || index.passingMode !== "by-value" ||
    member.parameters.some(parameter => parameter.optional === true || parameter.paramsArray === true) ||
    member.returnType === undefined || !targetTypeRefEquals(member.returnType, element)) return invalid();
  return { kind: "method", element, member };
}

function invalid(): CsharpCollectionElementRead {
  return { kind: "invalid", reason: "Native indexed reads require one exact readonly receiver/int32-to-element static member contract." };
}
