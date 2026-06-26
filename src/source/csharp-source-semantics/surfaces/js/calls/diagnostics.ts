import {
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingResult,
  ExtensionObservation,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  sourceLibraryMemberIdentity,
} from "../source-library.js";

export function rejectSourceLibraryCallWithoutClosedFacts(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceLibraryMemberIdentity(sourceMember)}' because the selected receiver lacks finalized target runtime facts.`));
}

export function rejectSourceLibraryCallMissingSelectedSignature(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE", 9100113, `C# JS surface call '${sourceLibraryMemberIdentity(sourceMember)}' requires exact selected TypeScript library signature identity because the declaration maps to multiple target members.`));
}

export function rejectSourceLibraryCallWithoutUniqueTargetMember(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED", 9100110, `C# JS surface could not map checked TypeScript library call '${sourceLibraryMemberIdentity(sourceMember)}' to a unique target member from finalized argument facts.`));
}
