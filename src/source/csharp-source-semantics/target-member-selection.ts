import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  selectExactTargetMember,
  selectTargetMember,
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
  if (candidates.length === 1 && declaration?.signatureId !== undefined) {
    return selectExactTargetMember(
      candidates[0]!,
      {
        arguments: request.arguments,
        receiver: request.calleeReceiver,
      },
      options,
    );
  }
  return selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
  }, context, resolveTargetTypeRef, options);
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
  const signatureMember = declaration?.signatureId === undefined
    ? undefined
    : members.find((member) => member.id === declaration.signatureId);
  if (signatureMember !== undefined && signatureMember.overloadGroup !== declaration?.memberId) {
    return [signatureMember];
  }
  if (declaration?.memberId !== undefined) {
    return members.filter((member) =>
      member.id === declaration.memberId ||
      member.overloadGroup === declaration.memberId
    );
  }
  return [];
}
