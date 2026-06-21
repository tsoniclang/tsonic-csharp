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
  sourceName: string | undefined,
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  resolveTargetTypeRef: TargetTypeRefResolver,
): TargetMember | undefined {
  const candidates = getTargetMemberCandidates(binding, declaration, sourceName);
  return selectTargetMember(candidates, request.arguments, context, resolveTargetTypeRef);
}

export function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): TargetMember | undefined {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.find((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  return memberName === undefined ? undefined : members.find((member) => member.sourceName === memberName);
}

function getTargetMemberCandidates(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  sourceName: string | undefined,
): readonly TargetMember[] {
  const members = binding.members ?? [];
  if (declaration?.signatureId !== undefined) {
    return members.filter((member) => member.id === declaration.signatureId);
  }
  const memberName = declaration?.memberName ?? sourceName;
  if (memberName !== undefined) {
    return members.filter((member) => member.sourceName === memberName);
  }
  return members.filter((member) => member.kind === "constructor");
}
