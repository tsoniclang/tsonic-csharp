import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../../target-types.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMemberMetadataWithSourceIdentities,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "../../target-member-metadata.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../../array-target-type.js";
import {
  targetTypeRefKey,
} from "../../../../target-ref-utils.js";
import {
  arrayTargetMemberMetadata,
} from "./metadata.js";

export function arrayTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverElementType?: TargetTypeRef,
  receiverDeclaringType?: TargetTypeRef,
): readonly CsharpTargetMember[] {
  const selectedMembers = decorateArrayCarrierSelectionFamilies(
    jsSurfaceTargetMembersForSelectedSourceIdentity(
    jsSurfaceTargetMemberMetadataIdentityIndex(
      jsSurfaceTargetMemberMetadataWithSourceIdentities(["Array", "ReadonlyArray"], arrayTargetMemberMetadata(receiverElementType)),
    ),
    selectedIdentity,
    ),
    selectedIdentity,
  );
  return filterArrayTargetMembersForReceiverDeclaringType(selectedMembers, receiverDeclaringType);
}

function decorateArrayCarrierSelectionFamilies(
  members: readonly CsharpTargetMember[],
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly CsharpTargetMember[] {
  const groups = new Map<string, CsharpTargetMember[]>();
  for (const member of members) {
    if (member.receiverPassing !== "first-argument" || member.parameters[0] === undefined) {
      continue;
    }
    const key = sourceFacingArrayOperationSignatureKey(member);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [member]);
    } else {
      group.push(member);
    }
  }
  const selections = new Map<string, CsharpTargetMember["csharpDeferredTargetSelection"]>();
  for (const group of groups.values()) {
    const canonical = group.filter((member) => isCsharpJsArrayCarrierTargetType(member.parameters[0]?.type));
    const implementations = group.filter((member) => !isCsharpJsArrayCarrierTargetType(member.parameters[0]?.type));
    if (canonical.length !== 1 || implementations.length === 0) {
      continue;
    }
    const familyId = `tsonic.csharp.js.array-carrier:${selectedIdentity.key}:${group.map((member) => member.id).sort().join("|")}`;
    for (const member of group) {
      selections.set(member.id, {
        familyId,
        variant: member === canonical[0] ? "canonical" : "implementation",
      });
    }
  }
  return members.map((member) => {
    const selection = selections.get(member.id);
    return selection === undefined
      ? member
      : { ...member, csharpDeferredTargetSelection: selection };
  });
}

function sourceFacingArrayOperationSignatureKey(member: CsharpTargetMember): string {
  return JSON.stringify({
    kind: member.kind,
    targetName: member.targetName,
    static: member.static === true,
    parameters: member.parameters.slice(1).map((parameter) => ({
      type: targetTypeRefKey(parameter.type),
      passingMode: parameter.passingMode,
      optional: parameter.optional === true,
      paramsArray: parameter.paramsArray === true,
    })),
    typeParameters: (member.typeParameters ?? []).map((parameter) => parameter.name),
  });
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
