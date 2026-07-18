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
import {
  csharpProviderDiagnostic,
} from "../../../diagnostics.js";
import {
  getTargetArgumentConversionSlots,
} from "../../../target-member-arguments/argument-conversions.js";

export function acceptSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  member: TargetMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  const argumentConversions = getTargetArgumentConversionSlots(member.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: request.sourceArgumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectSourceLibraryArgumentBindings(request, sourceMember, context);
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(member), [{ message: `C# JS surface target call operation recorded from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature: { member: targetMemberAsSourceSelectedSignature(member) },
    argumentConversions,
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
  const sourceSelectedMember = targetMemberAsSourceSelectedSignature(member);
  const argumentConversions = getTargetArgumentConversionSlots(sourceSelectedMember.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: request.sourceArgumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectSourceLibraryArgumentBindings(request, sourceMember, context);
  }
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
    kind: "target",
    selectedSignature: { member: sourceSelectedMember },
    argumentConversions,
  }, [{ message: `C# JS surface target call signature accepted from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'; target operation recording waits for finalized closed facts.` }]);
}

function rejectSourceLibraryArgumentBindings(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  return {
    kind: "reject",
    diagnostic: csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_LIBRARY_ARGUMENT_BINDINGS_NOT_PROVEN",
      9100188,
      `C# JS surface call '${sourceLibraryMemberIdentity(sourceMember)}' requires exact TSTS argument-slot evidence.`,
      undefined,
      request.call,
    ),
  };
}
