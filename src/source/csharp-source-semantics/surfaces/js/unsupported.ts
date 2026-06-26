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
  SourceLibraryMemberKeyPrefix,
} from "./source-library.js";
import {
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatchesAnyPrefix,
} from "./source-library.js";

const unsupportedSourceLibraryMemberIdPrefixes: readonly SourceLibraryMemberKeyPrefix[] = [];

export function rejectUnsupportedCsharpJsSourceLibraryCall(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (!sourceLibraryMemberMatchesAnyPrefix(sourceMember, unsupportedSourceLibraryMemberIdPrefixes)) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked TypeScript standard-library call '${sourceLibraryMemberIdentity(sourceMember)}'.`,
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
    `C# JS surface has no target mapping for checked TypeScript standard-library call '${sourceLibraryMemberIdentity(sourceMember)}'.`,
  ));
}

export function rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!sourceLibraryMemberMatchesAnyPrefix(sourceMember, unsupportedSourceLibraryMemberIdPrefixes)) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked TypeScript standard-library property '${sourceLibraryMemberIdentity(sourceMember)}'.`,
  ));
}

export function rejectUnmappedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED",
    9100131,
    `C# JS surface has no target mapping for checked TypeScript standard-library property '${sourceLibraryMemberIdentity(sourceMember)}'.`,
  ));
}
