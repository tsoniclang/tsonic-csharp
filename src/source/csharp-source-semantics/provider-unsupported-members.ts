import type {
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
} from "@tsonic/tsts";

export interface UnsupportedProviderTargetMember {
  readonly kind: "unsupported-member";
  readonly memberKind: string;
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
  return unsupportedMembers.find((member) => member.targetId === selectedId || member.metadataName === selectedId);
}
