import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndexForDeclaringNames,
  jsSurfaceTargetMembersForSourceMember,
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
