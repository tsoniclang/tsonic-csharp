import {
  acceptObservation,
  runtimeCarrierFactKey,
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
} from "../source-library.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../arrays.js";
import {
  csharpJsSourceLibraryMemberIsArrayConstructor,
} from "../policy.js";

export function acceptSourceLibraryCheckedCall(
  request: CheckedCallMappingRequest,
  sourceMember: SourceLibraryMember,
  member: TargetMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionObservation<CheckedCallMappingResult> {
  recordCsharpTargetOperation(context, request.call, csharpTargetOperationFromMember(member), [{ message: `C# JS surface target call operation recorded from checked TypeScript library declaration '${sourceMember.id}'.` }]);
  const returnType = member.returnType;
  if (
    csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember) &&
    returnType !== undefined &&
    isCsharpJsArrayCarrierTargetType(returnType) &&
    context.facts.get(request.call, runtimeCarrierFactKey) === undefined
  ) {
    context.facts.set(request.call, runtimeCarrierFactKey, { carrier: returnType }, [{ message: "C# JS surface Array constructor runtime carrier recorded from selected TypeScript Array constructor facts." }]);
  }
  return acceptObservation<CheckedCallMappingResult>({
    selectedSignature: { member },
  }, [{ message: `C# JS surface target call selected from checked TypeScript library declaration '${sourceMember.id}'.` }]);
}
