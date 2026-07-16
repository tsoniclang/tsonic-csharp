import {
  acceptObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSelectedCallTargetFactKey,
} from "../../../../csharp-facts.js";
import type {
  SourceLibraryMember,
} from "../source-library.js";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  sourceLibraryMemberIdentity,
} from "../source-library.js";
import {
  targetMemberAsSourceSelectedSignature,
} from "../../../selected-target-source-signature.js";
import {
  csharpTargetMemberFact,
} from "../../../target-types.js";

export function acceptSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  member: TargetMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(member), [{ message: `C# JS surface target call operation recorded from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: targetMemberAsSourceSelectedSignature(member) },
  }, [{ message: `C# JS surface target call selected from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
}

export function acceptDeferredSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  member: TargetMember,
  candidates: readonly TargetMember[],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  const csharpMember = csharpTargetMemberFact(member) as CsharpTargetMember;
  const deferredSelection = csharpMember.csharpDeferredTargetSelection;
  const selectionFamilyMembers = deferredSelection === undefined
    ? []
    : candidates
      .map(csharpTargetMemberFact)
      .filter((candidate): candidate is CsharpTargetMember =>
        candidate?.csharpDeferredTargetSelection?.familyId === deferredSelection.familyId);
  context.facts.set(request.call, csharpSelectedCallTargetFactKey, {
    member: csharpMember,
    ...(csharpMember.csharpCallFinalization === undefined ? {} : { finalizationRequirement: csharpMember.csharpCallFinalization }),
    ...(deferredSelection === undefined ? {} : {
      selectionFamily: {
        familyId: deferredSelection.familyId,
        sourceIdentity: sourceLibraryMemberIdentity(sourceMember),
        members: selectionFamilyMembers,
      },
    }),
  }, [{ message: `C# retained the exact selected target member for checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}' until closed receiver facts are finalized.` }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: targetMemberAsSourceSelectedSignature(member) },
  }, [{ message: `C# JS surface target call signature accepted from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'; target operation recording waits for finalized closed facts.` }]);
}
