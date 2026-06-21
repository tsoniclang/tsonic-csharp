import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetMember,
} from "@tsonic/tsts";
import {
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
  const candidates = getTargetMemberCandidatesForCall(binding, declaration, request);
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
  const memberName = declaration?.memberName;
  return memberName === undefined ? undefined : members.find((member) => member.sourceName === memberName);
}

function getTargetMemberCandidatesForCall(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedCallMappingRequest,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  const memberName = declaration?.memberName ?? request.calleePropertyName;
  const signatureMember = declaration?.signatureId === undefined
    ? undefined
    : members.find((member) => member.id === declaration.signatureId);
  if (memberName !== undefined) {
    return uniqueTargetMembers([
      signatureMember,
      ...members.filter((member) => member.sourceName === memberName),
    ]);
  }
  return uniqueTargetMembers([
    signatureMember,
    ...members.filter((member) => member.kind === "constructor"),
  ]);
}

function uniqueTargetMembers(members: readonly (TargetMember | undefined)[]): readonly TargetMember[] {
  const seen = new Set<string>();
  return members.filter((member): member is TargetMember => {
    if (member === undefined || seen.has(member.id)) {
      return false;
    }
    seen.add(member.id);
    return true;
  });
}
