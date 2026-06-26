import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "../../target-member-metadata.js";
import {
  arrayTargetMemberMetadata,
} from "./metadata.js";

export function arrayTargetMembersForSourceName(sourceName: string, receiverElementType?: TargetTypeRef): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(
    jsSurfaceTargetMemberMetadataIndex(arrayTargetMemberMetadata(receiverElementType)),
    sourceName,
  );
}
