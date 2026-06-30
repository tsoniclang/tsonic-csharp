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
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../target-types.js";
import {
  csharpTargetBindingFact,
} from "../target-types.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  getCsharpCheckedElementAccessRequestContext,
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
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
  readonly member: CsharpTargetMember | undefined;
}

export function selectCheckedPropertyTargetMember(
  binding: TargetBindingFact,
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): SelectedTargetMemberIdentity {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  return {
    selectedDeclaration,
    member: findTargetMember(csharpTargetBindingFact(binding) ?? binding, selectedDeclaration),
  };
}

export function selectCheckedElementTargetMember(
  binding: TargetBindingFact,
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  host: CsharpOperationsProviderHost,
  declaringTargetType: TargetTypeRef | undefined,
): SelectedTargetMemberIdentity {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  return {
    selectedDeclaration,
    member: findTargetMemberForElementAccess(
      csharpTargetBindingFact(binding) ?? binding,
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

export function resolveProviderVirtualDeclaration(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): ProviderVirtualDeclarationFact | undefined {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const declaration = context.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

export function getDeclaringTargetType(
  request: MemberAccessReceiverRequest,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return host.getTargetTypeRefForSubject(request.receiver, context) ??
    host.getTargetTypeRefForSubject(request.receiverType, context);
}

export function instantiateClosedSelectedTargetMember(
  member: CsharpTargetMember,
  host: CsharpOperationsProviderHost,
  declaringTargetType: TargetTypeRef | undefined,
): CsharpTargetMember | undefined {
  const csharpMember = instantiateSelectedTargetMember({ member }, host, { declaringTargetType });
  return csharpMember === undefined || !targetMemberIsClosed(csharpMember)
    ? undefined
    : csharpMember as CsharpTargetMember;
}
