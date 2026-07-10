import {
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingResult,
  CheckedOperationMappingResult,
  ExtensionEvidence,
  ExtensionObservation,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "./source-library.js";
import type {
  JsSurfaceUnsupportedOperation,
} from "./calls/member-providers/operation-types.js";
import {
  sourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
} from "./source-library.js";

const unsupportedSourceLibraryMemberIdentityPolicy = {
  prefixes: [],
} satisfies SourceLibraryMemberIdentityPolicy;

export function rejectUnsupportedCsharpJsSourceLibraryCall(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  unsupportedOperation?: JsSurfaceUnsupportedOperation,
  nodeOrSpan?: unknown,
): ExtensionObservation<CheckedCallMappingResult> | undefined {
  if (
    unsupportedOperation === undefined &&
    !sourceLibraryMemberMatches(sourceMember, unsupportedSourceLibraryMemberIdentityPolicy)
  ) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED",
    9100130,
    `C# JS surface hard-rejected selected Tsonic JS source-profile call '${sourceLibraryMemberIdentity(sourceMember)}': ${unsupportedOperation?.reason ?? "no closed operation facts exist for the selected JS surface operation."}`,
    unsupportedSurfaceOperationEvidence(sourceMember, unsupportedOperation),
    nodeOrSpan,
  ));
}

export function rejectUnmappedCsharpJsSourceLibraryCall(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  nodeOrSpan?: unknown,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED",
    9100131,
    `C# JS surface has no target mapping for checked Tsonic JS source-profile call '${sourceLibraryMemberIdentity(sourceMember)}'.`,
    unsupportedSurfaceOperationEvidence(sourceMember, {
      reason: "The selected JS surface call did not produce a unique target operation from finalized provider/runtime facts.",
      requiredFacts: [
        "selected JS source declaration/signature identity",
        "surface target operation metadata",
        "finalized receiver/argument carrier facts",
      ],
      capabilityId: "diagnostic.unsupported-selected-surface-operation",
    }),
    nodeOrSpan,
  ));
}

export function rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  nodeOrSpan?: unknown,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!sourceLibraryMemberMatches(sourceMember, unsupportedSourceLibraryMemberIdentityPolicy)) {
    return undefined;
  }
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNIMPLEMENTED",
    9100130,
    `C# JS surface has no closed operation facts for checked Tsonic JS source-profile property '${sourceLibraryMemberIdentity(sourceMember)}'.`,
    unsupportedSurfaceOperationEvidence(sourceMember, undefined),
    nodeOrSpan,
  ));
}

export function rejectUnmappedCsharpJsSourceLibraryPropertyAccess(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  nodeOrSpan?: unknown,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_JS_SURFACE_OPERATION_UNSUPPORTED",
    9100131,
    `C# JS surface has no target mapping for checked Tsonic JS source-profile property '${sourceLibraryMemberIdentity(sourceMember)}'.`,
    unsupportedSurfaceOperationEvidence(sourceMember, {
      reason: "The selected JS surface property did not produce a closed target operation from finalized provider/runtime facts.",
      requiredFacts: [
        "selected JS source declaration identity",
        "surface property target metadata",
        "finalized receiver carrier facts",
      ],
      capabilityId: "diagnostic.unsupported-selected-surface-operation",
    }),
    nodeOrSpan,
  ));
}

function unsupportedSurfaceOperationEvidence(
  sourceMember: SourceLibraryMember,
  unsupportedOperation: JsSurfaceUnsupportedOperation | undefined,
): readonly ExtensionEvidence[] {
  return [
    {
      message: "Selected JS surface operation evidence",
      details: {
        sourceIdentity: sourceLibraryMemberIdentity(sourceMember),
        reason: unsupportedOperation?.reason ?? "selected JS surface operation has no closed operation facts",
        requiredFacts: unsupportedOperation?.requiredFacts ?? [
          "selected JS source declaration identity",
          "surface target operation metadata",
        ],
        capabilityId: unsupportedOperation?.capabilityId ?? "diagnostic.unsupported-selected-surface-operation",
      },
    },
  ];
}
