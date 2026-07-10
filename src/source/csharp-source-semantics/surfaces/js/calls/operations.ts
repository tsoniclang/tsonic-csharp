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
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  sourceLibraryMemberIdentity,
} from "../source-library.js";
import {
  targetMemberAsSourceSelectedSignature,
} from "../../../selected-target-source-signature.js";

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
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  context.facts.set(request.call, csharpSelectedCallTargetFactKey, {
    member,
  }, [{ message: `C# retained the exact selected target member for checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}' until closed receiver facts are finalized.` }]);
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member: targetMemberAsSourceSelectedSignature(member) },
  }, [{ message: `C# JS surface target call signature accepted from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'; target operation recording waits for finalized closed facts.` }]);
}
