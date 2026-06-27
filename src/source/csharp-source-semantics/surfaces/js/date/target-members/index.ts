import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  SourceLibraryMember,
} from "../../source-library.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import type {
  DateCallKind,
} from "./call-kind.js";
import {
  dateCallKindTargetMembersForSelectedIdentity,
} from "./call-kind.js";
import {
  dateTargetMemberMetadata,
} from "./methods.js";

const dateTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Date", dateTargetMemberMetadata);

export function dateTargetMembersForSourceMember(sourceMember: SourceLibraryMember, callKind: DateCallKind): readonly TargetMember[] {
  return dateTargetMembersForSelectedIdentity({ key: sourceMember.id }, callKind);
}

export function dateTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  callKind: DateCallKind,
): readonly TargetMember[] {
  return dateCallKindTargetMembersForSelectedIdentity(selectedIdentity, callKind) ??
    jsSurfaceTargetMembersForSelectedSourceIdentity(dateTargetMemberIdentityIndex, selectedIdentity);
}
