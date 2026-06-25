import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
import {
  targetMemberIsClosed,
} from "../target-ref-utils.js";
import {
  findTargetMember,
  findTargetMemberForElementAccess,
} from "../target-member-selection.js";
import type {
  CheckedElementAccessContext,
  CheckedPropertyAccessContext,
} from "./types.js";

interface MemberAccessReceiverRequest {
  readonly receiverType?: ExtensionFactSubject | undefined;
  readonly receiver?: ExtensionFactSubject | undefined;
}

export interface SelectedTargetMemberIdentity {
  readonly selectedDeclaration: ProviderVirtualDeclarationFact | undefined;
  readonly member: TargetMember | undefined;
}

export function selectCheckedPropertyTargetMember(
  binding: TargetBindingFact,
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): SelectedTargetMemberIdentity {
  const selectedDeclaration = context.facts.get(request.sourceSelectedPropertySymbol, providerVirtualDeclarationFactKey) ??
    context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  return {
    selectedDeclaration,
    member: findTargetMember(binding, selectedDeclaration),
  };
}

export function selectCheckedElementTargetMember(
  binding: TargetBindingFact,
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  host: CsharpOperationsProviderHost,
  declaringTargetType: TargetTypeRef | undefined,
): SelectedTargetMemberIdentity {
  const selectedDeclaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
  return {
    selectedDeclaration,
    member: findTargetMemberForElementAccess(
      binding,
      selectedDeclaration,
      request,
      context,
      host.getTargetTypeRefForSubject,
      {
        getBaseTargetTypeRef: host.getBaseTargetTypeRef,
        ...(declaringTargetType !== undefined ? { declaringTargetType } : {}),
        ...(binding.typeParameters !== undefined ? { declaringTypeParameters: binding.typeParameters } : {}),
      },
    ),
  };
}

export function getDeclaringTargetType(
  request: MemberAccessReceiverRequest,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return host.getTargetTypeRefForSubject(request.receiverType, context) ??
    host.getTargetTypeRefForSubject(request.receiver, context);
}

export function instantiateClosedSelectedTargetMember(
  member: TargetMember,
  host: CsharpOperationsProviderHost,
  declaringTargetType: TargetTypeRef | undefined,
): TargetMember | undefined {
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  return csharpMember === undefined || !targetMemberIsClosed(csharpMember)
    ? undefined
    : csharpMember;
}
