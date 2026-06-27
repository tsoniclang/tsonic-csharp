import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
  jsSurfaceTargetMembersForSourceMember,
} from "../../target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  arrayTargetMemberMetadata,
} from "./metadata.js";

export function arrayTargetMembersForSourceMember(sourceMember: SourceLibraryMember, receiverElementType?: TargetTypeRef): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceMember(
    jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames(["Array", "ReadonlyArray"], arrayTargetMemberMetadata(receiverElementType)),
    sourceMember,
  );
}

export function arrayTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverElementType?: TargetTypeRef,
): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSelectedSourceIdentity(
    jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames(["Array", "ReadonlyArray"], arrayTargetMemberMetadata(receiverElementType)),
    selectedIdentity,
  );
}
