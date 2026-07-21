import type {
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
} from "./target-types.js";
import {
  csharpTargetBindingFact,
  csharpTargetMemberFacts,
} from "./target-types.js";
import {
  selectExactTargetMember,
  selectTargetMember,
} from "./target-member-arguments/index.js";
import type {
  TargetMemberSelectionOptions,
  TargetMemberSelectionRequest,
} from "./target-member-arguments/index.js";
import type {
  TargetTypeRefResolver,
} from "./target-type-ref-resolution.js";
import {
  getCsharpCheckedCallRequestContext,
} from "./checked-call-request-context.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import {
  getApplicableSourceCallEvidence,
} from "./selected-source-evidence.js";

export {
  selectTargetMember,
} from "./target-member-arguments/index.js";
export {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
export type {
  TargetMemberSelectionOptions,
  TargetMemberSourceValue,
} from "./target-member-arguments/index.js";
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
): CsharpTargetMember | undefined {
  const csharpBinding = csharpTargetBindingFact(binding);
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  const selectionRequest = targetMemberSelectionRequest(
    targetMemberSourceArguments(request.arguments, request.sourceArguments.map((argument) => argument.type)),
    declaration,
    requestContext.calleeReceiver === undefined
      ? undefined
      : requestContext.calleeReceiverType === undefined
        ? { subject: requestContext.calleeReceiver }
        : { subject: requestContext.calleeReceiver, selectedType: requestContext.calleeReceiverType },
    getApplicableSourceCallEvidence(request) !== undefined || declaration?.signatureId !== undefined,
  );
  if (declaration?.signatureId !== undefined) {
    const selectedMember = getTargetMemberByProviderDeclarationSignature(csharpBinding, declaration);
    if (selectedMember !== undefined) {
      const exact = selectExactTargetMember(
        selectedMember,
        selectionRequest,
        context,
        resolveTargetTypeRef,
        options,
      );
      if (exact !== undefined) {
        return exact;
      }
      const sourceProjectionCandidates = getTargetMembersByProviderSourceSignatureId(csharpBinding, declaration.signatureId, declaration);
      if (sourceProjectionCandidates.length === 1) {
        return selectExactTargetMember(
          sourceProjectionCandidates[0]!,
          selectionRequest,
          context,
          resolveTargetTypeRef,
          options,
        );
      }
      if (sourceProjectionCandidates.length > 1) {
        const sourceProjection = selectTargetMember(
          sourceProjectionCandidates,
          selectionRequest,
          context,
          resolveTargetTypeRef,
          options,
        );
        if (sourceProjection !== undefined) {
          return sourceProjection;
        }
      }
      return undefined;
    }
    const sourceProjectionCandidates = getTargetMembersByProviderSourceSignatureId(csharpBinding, declaration.signatureId, declaration);
    if (sourceProjectionCandidates.length === 1) {
      return selectExactTargetMember(
        sourceProjectionCandidates[0]!,
        selectionRequest,
        context,
        resolveTargetTypeRef,
        options,
      );
    }
    return sourceProjectionCandidates.length === 0
      ? undefined
      : selectTargetMember(
          sourceProjectionCandidates,
          selectionRequest,
          context,
          resolveTargetTypeRef,
          options,
        );
  }
  const candidates = getTargetMemberCandidates(csharpBinding, declaration);
  if (candidates.length === 1) {
    return selectExactTargetMember(
      candidates[0]!,
      selectionRequest,
      context,
      resolveTargetTypeRef,
      options,
    );
  }
  return declaration?.memberId === undefined
    ? undefined
    : selectTargetMember(
        candidates,
        selectionRequest,
        context,
        resolveTargetTypeRef,
        options,
      );
}

/**
 * The subset of a provider declaration identity that names one member. Both
 * fields are supplied by the checker; neither is derived from spelling.
 */
interface ProviderDeclarationMemberIdentity {
  readonly memberId?: string;
  readonly memberStatic?: boolean;
}

function targetMemberSelectionRequest(
  arguments_: TargetMemberSelectionRequest["arguments"],
  declaration: ProviderVirtualDeclarationFact | undefined,
  receiver?: TargetMemberSelectionRequest["receiver"],
  sourceSelectionProven = false,
): TargetMemberSelectionRequest {
  return {
    arguments: arguments_,
    ...(receiver !== undefined ? { receiver } : {}),
    ...(sourceSelectionProven ? { sourceSelectionProven: true } : {}),
    ...(declaration !== undefined ? { selectedProviderDeclaration: declaration } : {}),
  };
}

/**
 * Pairs each source argument subject with the exact selected type recorded for
 * that same argument. Both come from one checked request and are 1:1 by
 * construction, so pairing here keeps them aligned through receiver passing.
 */
function targetMemberSourceArguments(
  subjects: readonly ExtensionFactSubject[],
  selectedTypes: readonly (ExtensionFactSubject | undefined)[],
): TargetMemberSelectionRequest["arguments"] {
  return subjects.map((subject, index) => {
    const selectedType = selectedTypes[index];
    return selectedType === undefined ? { subject } : { subject, selectedType };
  });
}

export function findTargetMemberForElementAccess(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions = {},
): CsharpTargetMember | undefined {
  const csharpBinding = csharpTargetBindingFact(binding);
  const selectionRequest = targetMemberSelectionRequest(
    targetMemberSourceArguments([request.argument], [request.sourceArgument.type]),
    declaration,
    undefined,
    declaration?.signatureId !== undefined,
  );
  if (declaration?.signatureId === undefined) {
    return undefined;
  }
  const selectedMember = getTargetMemberByProviderDeclarationSignature(csharpBinding, declaration);
  if (selectedMember !== undefined) {
    return selectExactTargetMember(
      selectedMember,
      selectionRequest,
      context,
      resolveTargetTypeRef,
      options,
    );
  }
  const sourceProjectionCandidates = getTargetMembersByProviderSourceSignatureId(csharpBinding, declaration.signatureId, declaration);
  if (sourceProjectionCandidates.length === 1) {
    return selectExactTargetMember(
      sourceProjectionCandidates[0]!,
      selectionRequest,
      context,
      resolveTargetTypeRef,
      options,
    );
  }
  return sourceProjectionCandidates.length === 0
    ? undefined
    : selectTargetMember(
        sourceProjectionCandidates,
        selectionRequest,
        context,
        resolveTargetTypeRef,
        options,
      );
}

export function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): CsharpTargetMember | undefined {
  const members = csharpTargetMemberFacts(binding.members);
  if (declaration?.signatureId !== undefined) {
    return getTargetMemberByProviderDeclarationSignature(binding, declaration) ??
      createProviderSelectedMemberGroup(
        declaration.signatureId,
        getTargetMembersByProviderSourceSignatureId(binding, declaration.signatureId),
      );
  }
  if (declaration?.memberId !== undefined) {
    const selectedMember = members.find((member) => member.id === declaration.memberId);
    if (selectedMember !== undefined) {
      return selectedMember;
    }
    return createProviderSelectedMemberGroup(declaration.memberId, getTargetMemberCandidatesForMemberId(binding, declaration));
  }
  return undefined;
}

function createProviderSelectedMemberGroup(memberId: string, candidates: readonly CsharpTargetMember[]): CsharpTargetMember | undefined {
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

function hasSameTargetMemberGroupOperation(left: CsharpTargetMember, right: CsharpTargetMember): boolean {
  return left.kind === right.kind &&
    left.sourceName === right.sourceName &&
    left.targetName === right.targetName &&
    left.static === right.static &&
    left.readonly === right.readonly &&
    left.receiverPassing === right.receiverPassing &&
    optionalTargetTypeRefEquals(left.declaringType, right.declaringType);
}

function optionalTargetTypeRefEquals(left: CsharpTargetMember["declaringType"], right: CsharpTargetMember["declaringType"]): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return targetTypeRefEquals(left, right);
}

function getTargetMemberCandidates(
  binding: CsharpTargetBindingFact | undefined,
  declaration: ProviderVirtualDeclarationFact | undefined,
): readonly CsharpTargetMember[] {
  if (declaration?.signatureId !== undefined) {
    const signatureMember = getTargetMemberByProviderDeclarationSignature(binding, declaration);
    return signatureMember === undefined ? [] : [signatureMember];
  }
  if (declaration?.memberId !== undefined) {
    return getTargetMemberCandidatesForMemberId(binding, declaration);
  }
  return [];
}

function getTargetMemberCandidatesForMemberId(
  binding: CsharpTargetBindingFact | undefined,
  declaration: ProviderDeclarationMemberIdentity,
): readonly CsharpTargetMember[] {
  const memberId = declaration.memberId;
  if (memberId === undefined) {
    return [];
  }
  const members = binding?.members ?? [];
  const selectedMember = members.find((member) => member.id === memberId);
  if (selectedMember !== undefined) {
    return getTargetMemberCandidatesForSelectedMember(members, selectedMember);
  }
  const providerIdentityMembers = members.filter((member) => member.providerMemberId === memberId);
  if (providerIdentityMembers.length > 0) {
    return providerIdentityMembers.filter((member) => targetMemberMatchesSelectedStaticness(member, declaration));
  }
  return members
    .filter((member) => member.overloadGroup === memberId)
    .filter((member) => targetMemberMatchesSelectedStaticness(member, declaration));
}

/**
 * Staticness is supplied by the checker as `memberStatic`; it is never inferred
 * from the member id spelling. Absent evidence does not constrain the match,
 * but contradictory evidence rejects the candidate.
 */
function targetMemberMatchesSelectedStaticness(
  member: CsharpTargetMember,
  declaration: ProviderDeclarationMemberIdentity,
): boolean {
  return declaration.memberStatic === undefined ||
    declaration.memberStatic === (member.static === true);
}

function getTargetMemberById(
  binding: CsharpTargetBindingFact | undefined,
  memberId: string,
): CsharpTargetMember | undefined {
  return (binding?.members ?? []).find((member) => member.id === memberId);
}

function getTargetMemberByProviderDeclarationSignature(
  binding: CsharpTargetBindingFact | undefined,
  declaration: ProviderVirtualDeclarationFact,
): CsharpTargetMember | undefined {
  if (declaration.signatureId === undefined) {
    return undefined;
  }
  const member = getTargetMemberById(binding, declaration.signatureId);
  if (member === undefined) {
    return undefined;
  }
  if (declaration.memberId === undefined) {
    return member;
  }
  const memberIdentityCandidates = getTargetMemberCandidatesForMemberId(binding, declaration);
  if (memberIdentityCandidates.length === 0) {
    // No member-identity evidence resolved. The signature match still stands
    // only when the selected staticness does not contradict it.
    return targetMemberMatchesSelectedStaticness(member, declaration) ? member : undefined;
  }
  return memberIdentityCandidates.some((candidate) => candidate.id === member.id)
    ? member
    : undefined;
}

function getTargetMembersByProviderSourceSignatureId(
  binding: CsharpTargetBindingFact | undefined,
  providerSourceSignatureId: string,
  declaration?: ProviderDeclarationMemberIdentity,
): readonly CsharpTargetMember[] {
  const sourceSignatureCandidates = (binding?.members ?? []).filter((member) => member.providerSourceSignatureId === providerSourceSignatureId);
  if (declaration?.memberId === undefined) {
    return sourceSignatureCandidates;
  }
  const selectedMemberCandidates = getTargetMemberCandidatesForMemberId(binding, declaration);
  if (selectedMemberCandidates.length === 0) {
    return sourceSignatureCandidates;
  }
  const selectedMemberCandidateIds = new Set(selectedMemberCandidates.map((member) => member.id));
  return sourceSignatureCandidates.filter((member) => selectedMemberCandidateIds.has(member.id));
}

function getTargetMemberCandidatesForSelectedMember(
  members: readonly CsharpTargetMember[],
  selectedMember: CsharpTargetMember,
): readonly CsharpTargetMember[] {
  if (selectedMember.overloadGroup === undefined) {
    return [selectedMember];
  }
  const overloadGroup = members.filter((member) => member.overloadGroup === selectedMember.overloadGroup);
  return overloadGroup.length === 0 ? [selectedMember] : overloadGroup;
}

