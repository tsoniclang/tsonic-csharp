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
