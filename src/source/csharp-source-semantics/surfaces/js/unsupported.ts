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
} from "./source-library.js";

const unsupportedSourceLibraryDeclaringNames = new Set<SourceLibraryMember["declaringName"]>([
  "Object",
  "JSON",
  "Console",
]);

export function rejectUnsupportedCsharpJsSourceLibraryCall(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (!unsupportedSourceLibraryDeclaringNames.has(sourceMember.declaringName)) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked TypeScript standard-library call '${sourceMember.declaringName}.${sourceMember.memberName}'.`,
  ));
}

export function rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!unsupportedSourceLibraryDeclaringNames.has(sourceMember.declaringName)) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked TypeScript standard-library property '${sourceMember.declaringName}.${sourceMember.memberName}'.`,
  ));
}
