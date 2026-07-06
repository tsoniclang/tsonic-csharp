import type {
  ArgumentPassingFact,
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
} from "@tsonic/tsts";
import {
  argumentPassingFactKey,
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

export {
  selectTargetMember,
} from "./target-member-arguments/index.js";
export {
  isLiteralRepresentableAsTargetType,
} from "./target-member-literals.js";
export type {
  TargetMemberSelectionOptions,
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
  const checkedSourceSelection = getCheckedSourceSelectionEvidence(request.sourceSelectedSignature, declaration);
  const selectionRequest = targetMemberSelectionRequest(
    request.arguments,
    declaration,
    requestContext.calleeReceiver,
    checkedSourceSelection,
  );
  if (declaration?.signatureId !== undefined) {
    const selectedMember = getTargetMemberById(csharpBinding, declaration.signatureId);
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
      const sourceProjectionCandidates = getTargetMembersByProviderSourceSignatureId(csharpBinding, declaration.signatureId, declaration.memberId);
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
      if (checkedCallHasTargetPassingFacts(request, context)) {
        return selectTargetMember(
          getTargetMemberOverloadGroupCandidates(csharpBinding, selectedMember),
          selectionRequest,
          context,
          resolveTargetTypeRef,
          options,
        );
      }
      return undefined;
    }
    const sourceProjectionCandidates = getTargetMembersByProviderSourceSignatureId(csharpBinding, declaration.signatureId, declaration.memberId);
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

function checkedCallHasTargetPassingFacts(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext,
): boolean {
  return request.arguments.some((argument) => {
    const passing = getArgumentPassingFact(argument, context);
    return passing !== undefined && passing.mode !== "by-value";
  });
}

function getArgumentPassingFact(
  argument: CheckedCallMappingRequest["arguments"][number],
  context: ExtensionObservationContext,
): ArgumentPassingFact | undefined {
  const factContext = context as {
    readonly factResolver?: ExtensionObservationContext["factResolver"];
    readonly facts?: ExtensionObservationContext["facts"];
  };
  return factContext.factResolver?.resolve(argument, argumentPassingFactKey) ??
    factContext.facts?.get(argument, argumentPassingFactKey);
}

function getTargetMemberOverloadGroupCandidates(
  binding: CsharpTargetBindingFact | undefined,
  selectedMember: CsharpTargetMember,
): readonly CsharpTargetMember[] {
  return (binding?.members ?? []).filter((member) =>
    member.kind === selectedMember.kind &&
    member.overloadGroup !== undefined &&
    selectedMember.overloadGroup !== undefined &&
    member.overloadGroup === selectedMember.overloadGroup
  );
}

function targetMemberSelectionRequest(
  arguments_: TargetMemberSelectionRequest["arguments"],
  declaration: ProviderVirtualDeclarationFact | undefined,
  receiver?: TargetMemberSelectionRequest["receiver"],
  sourceSelectedSignature?: TargetMemberSelectionRequest["sourceSelectedSignature"],
): TargetMemberSelectionRequest {
  return {
    arguments: arguments_,
    ...(receiver !== undefined ? { receiver } : {}),
    ...(sourceSelectedSignature !== undefined ? { sourceSelectedSignature } : {}),
    ...(declaration !== undefined ? { selectedProviderDeclaration: declaration } : {}),
  };
}

function getCheckedSourceSelectionEvidence(
  sourceSelectedSignature: CheckedCallMappingRequest["sourceSelectedSignature"],
  declaration: ProviderVirtualDeclarationFact | undefined,
): unknown {
  return sourceSelectedSignature ?? (declaration?.signatureId === undefined ? undefined : declaration);
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
    [request.argument],
    declaration,
    undefined,
    getCheckedSourceSelectionEvidence(undefined, declaration),
  );
  if (declaration?.signatureId !== undefined) {
    const selectedMember = getTargetMemberById(csharpBinding, declaration.signatureId);
    if (selectedMember !== undefined) {
      return selectExactTargetMember(
        selectedMember,
        selectionRequest,
        context,
        resolveTargetTypeRef,
        options,
      );
    }
    const sourceProjectionCandidates = getTargetMembersByProviderSourceSignatureId(csharpBinding, declaration.signatureId, declaration.memberId);
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
  if (declaration === undefined) {
    return selectSingleProviderIndexer(csharpBinding, request, context, resolveTargetTypeRef, options);
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
  if (declaration?.memberId === undefined) {
    return selectSingleProviderIndexer(csharpBinding, request, context, resolveTargetTypeRef, options);
  }
  const selected = selectTargetMember(
    candidates,
    selectionRequest,
    context,
    resolveTargetTypeRef,
    options,
  );
  return selected
    ?? (candidates.length === 0
      ? selectSingleProviderIndexer(csharpBinding, request, context, resolveTargetTypeRef, options)
      : undefined);
}

function selectSingleProviderIndexer(
  binding: CsharpTargetBindingFact | undefined,
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  resolveTargetTypeRef: TargetTypeRefResolver,
  options: TargetMemberSelectionOptions,
): CsharpTargetMember | undefined {
  const indexerCandidates = (binding?.members ?? []).filter((member) => member.kind === "indexer");
  return indexerCandidates.length === 1
    ? selectExactTargetMember(
        indexerCandidates[0]!,
        {
          arguments: [request.argument],
        },
        context,
        resolveTargetTypeRef,
        options,
      )
    : undefined;
}

export function findTargetMember(
  binding: TargetBindingFact,
  declaration: ProviderVirtualDeclarationFact | undefined,
): CsharpTargetMember | undefined {
  const members = csharpTargetMemberFacts(binding.members);
  if (declaration?.signatureId !== undefined) {
    return members.find((member) => member.id === declaration.signatureId) ??
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
    return createProviderSelectedMemberGroup(declaration.memberId, getTargetMemberCandidatesForMemberId(binding, declaration.memberId));
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
    const signatureMember = getTargetMemberById(binding, declaration.signatureId);
    return signatureMember === undefined ? [] : [signatureMember];
  }
  if (declaration?.memberId !== undefined) {
    return getTargetMemberCandidatesForMemberId(binding, declaration.memberId);
  }
  return [];
}

function getTargetMemberCandidatesForMemberId(
  binding: CsharpTargetBindingFact | undefined,
  memberId: string,
): readonly CsharpTargetMember[] {
  const members = binding?.members ?? [];
  const selectedMember = members.find((member) => member.id === memberId);
  if (selectedMember !== undefined) {
    return getTargetMemberCandidatesForSelectedMember(members, selectedMember);
  }
  const disambiguated = providerDisambiguatedMemberId(memberId);
  if (disambiguated !== undefined) {
    return members.filter((member) =>
      member.overloadGroup === disambiguated.baseId &&
      targetMemberStaticFlag(member) === disambiguated.static
    );
  }
  return members.filter((member) => member.overloadGroup === memberId);
}

function getTargetMemberById(
  binding: CsharpTargetBindingFact | undefined,
  memberId: string,
): CsharpTargetMember | undefined {
  const members = binding?.members ?? [];
  const exact = members.find((member) => member.id === memberId);
  if (exact !== undefined) {
    return exact;
  }
  const disambiguated = providerDisambiguatedMemberId(memberId);
  return disambiguated === undefined
    ? undefined
    : members.find((member) =>
        member.id === disambiguated.baseId &&
        targetMemberStaticFlag(member) === disambiguated.static
      );
}

function getTargetMembersByProviderSourceSignatureId(
  binding: CsharpTargetBindingFact | undefined,
  providerSourceSignatureId: string,
  selectedMemberId?: string,
): readonly CsharpTargetMember[] {
  const sourceSignatureCandidates = (binding?.members ?? []).filter((member) => member.providerSourceSignatureId === providerSourceSignatureId);
  if (selectedMemberId === undefined) {
    return sourceSignatureCandidates;
  }
  const selectedMemberCandidates = getTargetMemberCandidatesForMemberId(binding, selectedMemberId);
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

function providerDisambiguatedMemberId(memberId: string): { readonly baseId: string; readonly static: boolean } | undefined {
  if (memberId.endsWith("#static")) {
    return { baseId: memberId.slice(0, -"#static".length), static: true };
  }
  if (memberId.endsWith("#instance")) {
    return { baseId: memberId.slice(0, -"#instance".length), static: false };
  }
  return undefined;
}

function targetMemberStaticFlag(member: CsharpTargetMember): boolean {
  return member.static === true;
}
