import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMembersForSourceMember,
} from "../../target-member-metadata.js";
import type {
  DateCallKind,
} from "./call-kind.js";
import {
  dateCallKindTargetMembersForSourceMember,
} from "./call-kind.js";
import {
  dateTargetMemberMetadata,
} from "./methods.js";

const dateTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Date", dateTargetMemberMetadata);

export function dateTargetMembersForSourceMember(sourceMember: SourceLibraryMember, callKind: DateCallKind): readonly TargetMember[] {
  return dateCallKindTargetMembersForSourceMember(sourceMember, callKind) ??
    jsSurfaceTargetMembersForSourceMember(dateTargetMemberIdentityIndex, sourceMember);
}
