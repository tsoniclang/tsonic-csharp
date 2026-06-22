import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  selectTargetMember,
  selectExactTargetMember,
} from "./target-member-arguments.js";
import type {
  TargetMemberSelectionOptions,
} from "./target-member-arguments.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";

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
  const candidates = getTargetMemberCandidatesForCall(binding, declaration);
  if (candidates.length === 1) {
    return selectExactTargetMember(
      candidates[0]!,
      {
        arguments: request.arguments,
        receiver: request.calleeReceiver,
      },
      options,
    );
  }
  if (declaration?.signatureId !== undefined && candidates.length > 1) {
    return selectTargetMember(
      candidates,
      {
        arguments: request.arguments,
        receiver: request.calleeReceiver,
      },
      context,
      resolveTargetTypeRef,
      options,
    );
  }
  return undefined;
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
    return members.find((member) => member.id === declaration.memberId);
  }
  return undefined;
}

function getTargetMemberCandidatesForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    const signatureMember = members.find((member) => member.id === declaration.signatureId);
    if (signatureMember === undefined) {
      return [];
    }
    if (signatureMember.overloadGroup === undefined) {
      return [signatureMember];
    }
    const overloadGroup = members.filter((member) => member.overloadGroup === signatureMember.overloadGroup);
    return overloadGroup.length === 0 ? [signatureMember] : overloadGroup;
  }
  if (declaration?.memberId !== undefined) {
    return members.filter((member) =>
      member.id === declaration.memberId ||
      member.overloadGroup === declaration.memberId
    );
  }
  return [];
}
