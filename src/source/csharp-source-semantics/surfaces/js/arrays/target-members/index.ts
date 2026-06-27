import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
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
): readonly TargetMember[] {
  return filterArrayTargetMembersForReceiverDeclaringType(jsSurfaceTargetMembersForSelectedSourceIdentity(
    jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames(["Array", "ReadonlyArray"], arrayTargetMemberMetadata(receiverElementType)),
    selectedIdentity,
  ), receiverDeclaringType);
}

function filterArrayTargetMembersForReceiverDeclaringType(
  members: readonly TargetMember[],
  receiverDeclaringType: TargetTypeRef | undefined,
): readonly TargetMember[] {
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
