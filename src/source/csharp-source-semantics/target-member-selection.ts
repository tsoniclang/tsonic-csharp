import type {
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  selectExactTargetMember,
  selectTargetMember,
  selectProviderSelectedTargetMember,
} from "./target-member-arguments.js";
import type {
  TargetMemberSelectionOptions,
} from "./target-member-arguments.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";

export {
  selectTargetMember,
} from "./target-member-arguments.js";
export {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
export type {
  TargetMemberSelectionOptions,
} from "./target-member-arguments.js";
export type {
  TargetTypeRefResolutionOptions,
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";

export function findTargetMemberForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): TargetMember | undefined {
  if (declaration?.signatureId !== undefined) {
    const selectedMember = getTargetMemberById(binding, declaration.signatureId);
    const exactMember = selectedMember === undefined
      ? undefined
      : selectProviderSelectedTargetMember(
          selectedMember,
          {
            arguments: request.arguments,
            receiver: request.calleeReceiver,
            sourceSelectedSignature: request.sourceSelectedSignature,
          },
          context,
          resolveTargetTypeRef,
          options,
        );
    if (exactMember !== undefined) {
      return exactMember;
    }
    return selectedMember === undefined
      ? undefined
      : selectTargetMember(
          getTargetMemberCandidatesForSelectedMember(binding.members ?? [], selectedMember),
          {
            arguments: request.arguments,
            receiver: request.calleeReceiver,
            sourceSelectedSignature: request.sourceSelectedSignature,
          },
          context,
          resolveTargetTypeRef,
          options,
        );
  }
  const candidates = getTargetMemberCandidates(binding, declaration);
  if (candidates.length === 1) {
    return selectExactTargetMember(
      candidates[0]!,
      {
        arguments: request.arguments,
        receiver: request.calleeReceiver,
        sourceSelectedSignature: request.sourceSelectedSignature,
      },
      options,
    );
  }
  return declaration?.memberId === undefined
    ? undefined
    : selectTargetMember(
        candidates,
        {
          arguments: request.arguments,
          receiver: request.calleeReceiver,
          sourceSelectedSignature: request.sourceSelectedSignature,
        },
        context,
        resolveTargetTypeRef,
        options,
      );
}

export function findTargetMemberForElementAccess(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): TargetMember | undefined {
  if (declaration?.signatureId !== undefined) {
    const selectedMember = getTargetMemberById(binding, declaration.signatureId);
    const exactMember = selectedMember === undefined
      ? undefined
      : selectProviderSelectedTargetMember(
          selectedMember,
          {
            arguments: [request.argument],
          },
          context,
          resolveTargetTypeRef,
          options,
        );
    if (exactMember !== undefined) {
      return exactMember;
    }
    return selectedMember === undefined
      ? undefined
      : selectTargetMember(
          getTargetMemberCandidatesForSelectedMember(binding.members ?? [], selectedMember),
          {
            arguments: [request.argument],
          },
          context,
          resolveTargetTypeRef,
          options,
        );
  }
  const candidates = getTargetMemberCandidates(binding, declaration);
  if (candidates.length === 1) {
    return selectExactTargetMember(
      candidates[0]!,
      {
        arguments: [request.argument],
      },
      options,
    );
  }
  return declaration?.memberId === undefined
    ? undefined
    : selectTargetMember(
        candidates,
        {
          arguments: [request.argument],
        },
        context,
        resolveTargetTypeRef,
        options,
      );
}

export function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): TargetMember | undefined {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.find((member) => member.id === declaration.signatureId);
  }
  if (declaration?.memberId !== undefined) {
    const selectedMember = members.find((member) => member.id === declaration.memberId);
    if (selectedMember !== undefined) {
      return selectedMember;
    }
    return createProviderSelectedMemberGroup(declaration.memberId, members.filter((member) => member.overloadGroup === declaration.memberId));
  }
  return undefined;
}

function createProviderSelectedMemberGroup(memberId: string, candidates: readonly TargetMember[]): TargetMember | undefined {
  const first = candidates[0];
  if (first === undefined) {
    return undefined;
  }
  if (!candidates.every((candidate) => hasSameTargetMemberGroupOperation(first, candidate))) {
    return undefined;
  }
  return {
    id: memberId,
    sourceName: first.sourceName,
    targetName: first.targetName,
    kind: first.kind,
    parameters: [],
    ...(first.static === true ? { static: true } : {}),
    ...(first.readonly === true ? { readonly: true } : {}),
    ...(first.receiverPassing !== undefined ? { receiverPassing: first.receiverPassing } : {}),
    ...(first.declaringType !== undefined ? { declaringType: first.declaringType } : {}),
  };
}

function hasSameTargetMemberGroupOperation(left: TargetMember, right: TargetMember): boolean {
  return left.kind === right.kind &&
    left.sourceName === right.sourceName &&
    left.targetName === right.targetName &&
    left.static === right.static &&
    left.readonly === right.readonly &&
    left.receiverPassing === right.receiverPassing &&
    optionalTargetTypeRefEquals(left.declaringType, right.declaringType);
}

function optionalTargetTypeRefEquals(left: TargetMember["declaringType"], right: TargetMember["declaringType"]): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return targetTypeRefEquals(left, right);
}

function getTargetMemberCandidates(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): readonly TargetMember[] {
  if (declaration?.signatureId !== undefined) {
    const signatureMember = getTargetMemberById(binding, declaration.signatureId);
    return signatureMember === undefined ? [] : [signatureMember];
  }
  if (declaration?.memberId !== undefined) {
    return getTargetMemberCandidatesForMemberId(binding, declaration.memberId);
  }
  return [];
}

function getTargetMemberCandidatesForMemberId(
  binding: TargetBindingFact,
  memberId: string,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  const selectedMember = members.find((member) => member.id === memberId);
  if (selectedMember !== undefined) {
    return getTargetMemberCandidatesForSelectedMember(members, selectedMember);
  }
  return members.filter((member) => member.overloadGroup === memberId);
}

function getTargetMemberById(
  binding: TargetBindingFact,
  memberId: string,
): TargetMember | undefined {
  return (binding.members ?? []).find((member) => member.id === memberId);
}

function getTargetMemberCandidatesForSelectedMember(
  members: readonly TargetMember[],
  selectedMember: TargetMember,
): readonly TargetMember[] {
  if (selectedMember.overloadGroup === undefined) {
    return [selectedMember];
  }
  const overloadGroup = members.filter((member) => member.overloadGroup === selectedMember.overloadGroup);
  return overloadGroup.length === 0 ? [selectedMember] : overloadGroup;
}
