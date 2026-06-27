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
  arrayTargetMemberMetadata,
} from "./metadata.js";

export function arrayTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverElementType?: TargetTypeRef,
): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSelectedSourceIdentity(
    jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames(["Array", "ReadonlyArray"], arrayTargetMemberMetadata(receiverElementType)),
    selectedIdentity,
  );
}
