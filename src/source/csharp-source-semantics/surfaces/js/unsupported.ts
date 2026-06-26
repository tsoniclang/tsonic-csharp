import {
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingResult,
  CheckedOperationMappingResult,
  ExtensionObservation,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberId,
} from "./source-library.js";

type UnsupportedSourceLibraryMemberIdPrefix = `${SourceLibraryMember["declaringName"]}.`;

const unsupportedSourceLibraryMemberIdPrefixes: readonly UnsupportedSourceLibraryMemberIdPrefix[] = [];

export function rejectUnsupportedCsharpJsSourceLibraryCall(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (!unsupportedSourceLibraryMemberIdPrefixes.some((prefix) => sourceMemberIdMatchesPrefix(sourceMember.id, prefix))) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked TypeScript standard-library call '${sourceMember.id}'.`,
  ));
}

export function rejectUnmappedCsharpJsSourceLibraryCall(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED",
    9100131,
    `C# JS surface has no target mapping for checked TypeScript standard-library call '${sourceMember.id}'.`,
  ));
}

export function rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!unsupportedSourceLibraryMemberIdPrefixes.some((prefix) => sourceMemberIdMatchesPrefix(sourceMember.id, prefix))) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked TypeScript standard-library property '${sourceMember.id}'.`,
  ));
}

function sourceMemberIdMatchesPrefix(sourceMemberId: SourceLibraryMemberId, prefix: UnsupportedSourceLibraryMemberIdPrefix): boolean {
  return sourceMemberId.startsWith(prefix);
}

export function rejectUnmappedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED",
    9100131,
    `C# JS surface has no target mapping for checked TypeScript standard-library property '${sourceMember.id}'.`,
  ));
}
