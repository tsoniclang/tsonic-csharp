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
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";

export {
  selectTargetMember,
} from "./target-member-arguments.js";
export {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
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
): TargetMember | undefined {
  const candidates = getTargetMemberCandidates(binding, declaration);
  return selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
  }, context, resolveTargetTypeRef);
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

function getTargetMemberCandidates(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.filter((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName;
  if (memberName !== undefined) {
    return members.filter((member) => member.sourceName === memberName);
  }
  return members.filter((member) => member.kind === "constructor");
}
