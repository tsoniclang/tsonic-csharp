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
  csharpTargetMemberAsSourceSelectedSignature,
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
import {
  getApplicableSourceCallEvidence,
} from "../../../selected-source-evidence.js";
import {
  recordSelectedCallResultCarrier,
} from "./request-carrier-facts.js";

export function acceptSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  member: TargetMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  const csharpMember = csharpTargetMemberFact(member) as CsharpTargetMember;
  const csharpSourceSelectedMember = csharpTargetMemberAsSourceSelectedSignature(csharpMember);
  const sourceSelectedMember = targetMemberAsSourceSelectedSignature(csharpMember);
  const argumentConversions = getTargetArgumentConversionSlots(csharpSourceSelectedMember.parameters, {
    argumentCount: request.arguments.length,
    sourceArgumentBindings: getApplicableSourceCallEvidence(request)?.argumentBindings,
  });
  if (argumentConversions === undefined) {
    return rejectSourceLibraryArgumentBindings(request, sourceMember, context);
  }
  if (recordSelectedCallResultCarrier(request, member, context) === "conflict") {
    return rejectSourceLibraryCallResultCarrierConflict(request, sourceMember, context);
  }
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(member), [{ message: `C# JS surface target call operation recorded from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
  return acceptObservation<CheckedCallMappingResult>({
    kind: "target",
    selectedSignature: { member: sourceSelectedMember },
    argumentConversions,
  }, [{ message: `C# JS surface target call selected from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
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

function rejectSourceLibraryCallResultCarrierConflict(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  return {
    kind: "reject",
    diagnostic: csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_SOURCE_LIBRARY_CALL_RESULT_CARRIER_CONFLICT",
      9100191,
      `C# JS surface call '${sourceLibraryMemberIdentity(sourceMember)}' produced conflicting exact target result-carrier facts.`,
      [{ message: "Selected target call result carrier conflicts with an existing target-owned carrier fact." }],
      request.call,
    ),
  };
}
