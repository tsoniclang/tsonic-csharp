import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "../../target-member-metadata.js";
import type {
  DateCallKind,
} from "./call-kind.js";
import {
  dateCallKindTargetMembers,
} from "./call-kind.js";
import {
  dateTargetMemberMetadata,
} from "./methods.js";

const dateTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(dateTargetMemberMetadata);

export function dateTargetMembersForSourceName(sourceName: string, callKind: DateCallKind): readonly TargetMember[] {
  return dateCallKindTargetMembers(sourceName, callKind) ??
    jsSurfaceTargetMembersForSourceName(dateTargetMemberIndex, sourceName);
}
