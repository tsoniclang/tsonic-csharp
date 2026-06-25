import type {
  ExtensionEvidence,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetMember,
} from "@tsonic/tsts";

export interface UnsupportedProviderTargetMember {
  readonly kind: "unsupported-member";
  readonly memberKind: TargetMember["kind"];
  readonly sourceName: string;
  readonly targetName: string;
  readonly targetId: string;
  readonly metadataName: string;
  readonly static?: boolean;
  readonly reason: string;
}

export interface TargetBindingWithUnsupportedMembers extends TargetBindingFact {
  readonly unsupportedMembers?: readonly UnsupportedProviderTargetMember[];
}

export function findUnsupportedProviderTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): UnsupportedProviderTargetMember | undefined {
  const unsupportedMembers = (binding as TargetBindingWithUnsupportedMembers).unsupportedMembers;
  if (unsupportedMembers === undefined || unsupportedMembers.length === 0) {
    return undefined;
  }
  const selectedId = declaration?.signatureId ?? declaration?.memberId;
  if (selectedId === undefined) {
    return undefined;
  }
  return unsupportedMembers.find((member) => member.targetId === selectedId);
}

export function unsupportedProviderTargetMemberEvidence(
  bindingId: string,
  member: UnsupportedProviderTargetMember,
): readonly ExtensionEvidence[] {
  return [{
    message: "C# provider target binding recorded an unsupported target member fact selected by TSTS.",
    details: {
      bindingId,
      memberKind: member.memberKind,
      sourceName: member.sourceName,
      targetName: member.targetName,
      targetId: member.targetId,
      metadataName: member.metadataName,
      ...(member.static !== undefined ? { static: member.static } : {}),
      reason: member.reason,
    },
  }];
}
