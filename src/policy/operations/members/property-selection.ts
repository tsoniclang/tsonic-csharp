import type { SourceMemberAccessSelection } from "@tsonic/target-api/source";
import type { CsharpTargetReceiverRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../types/index.js";

export function providerReceiverMatchesProperty(
  receiver: CsharpTargetReceiverRelation,
  targetMember: CsharpTargetMember,
  _source: SourceMemberAccessSelection,
): boolean {
  switch (receiver.kind) {
    case "instance":
      return targetMember.static !== true;
    case "none":
      return targetMember.static === true;
    case "target-parameter":
      return targetMember.parameters[
          receiver.targetParameterIndex
        ] !== undefined;
  }
}

export function csharpProviderPropertySupportsAccess(
  member: CsharpTargetMember,
  accessMode: SourceMemberAccessSelection["access"],
): boolean {
  if (
    member.kind !== "property" &&
    member.kind !== "field" &&
    member.kind !== "event"
  ) {
    return false;
  }
  if (accessMode === "write" || accessMode === "read-write") {
    return member.readonly !== true && member.returnType !== undefined;
  }
  return member.returnType !== undefined;
}
