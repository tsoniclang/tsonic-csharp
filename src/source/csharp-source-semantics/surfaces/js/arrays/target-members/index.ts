import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../../target-types.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../../array-target-type.js";
import {
  arrayTargetMemberMetadata,
} from "./metadata.js";

export function arrayTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverElementType?: TargetTypeRef,
  receiverDeclaringType?: TargetTypeRef,
): readonly CsharpTargetMember[] {
  return filterArrayTargetMembersForReceiverDeclaringType(jsSurfaceTargetMembersForSelectedSourceIdentity(
    jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames(["Array", "ReadonlyArray"], arrayTargetMemberMetadata(receiverElementType)),
    selectedIdentity,
  ), receiverDeclaringType);
}

function filterArrayTargetMembersForReceiverDeclaringType(
  members: readonly CsharpTargetMember[],
  receiverDeclaringType: TargetTypeRef | undefined,
): readonly CsharpTargetMember[] {
  if (receiverDeclaringType === undefined) {
    return members;
  }
  const receiverUsesJsArrayCarrier = isCsharpJsArrayCarrierTargetType(receiverDeclaringType);
  return members.filter((member) => {
    if (member.receiverPassing !== "first-argument") {
      return true;
    }
    return isCsharpJsArrayCarrierTargetType(member.parameters[0]?.type) === receiverUsesJsArrayCarrier;
  });
}
