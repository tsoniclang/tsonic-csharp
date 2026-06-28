import {
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingResult,
  ExtensionEvidence,
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
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED",
    9100110,
    `C# JS surface could not map checked TypeScript library call '${sourceLibraryMemberIdentity(sourceMember)}' because the selected receiver lacks finalized target runtime facts.`,
    missingSurfaceCallEvidence(sourceMember, "missing-finalized-receiver-carrier", [
      "selected JS source declaration/signature identity",
      "finalized receiver runtime-carrier fact",
      "surface target operation metadata",
    ]),
  ));
}

export function rejectSourceLibraryCallMissingSelectedSignature(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_SOURCE_LIBRARY_CALL_REQUIRES_SELECTED_SIGNATURE",
    9100113,
    `C# JS surface call '${sourceLibraryMemberIdentity(sourceMember)}' requires exact selected TypeScript library signature identity before target mapping.`,
    missingSurfaceCallEvidence(sourceMember, "missing-selected-source-signature", [
      "TSTS selected source signature identity",
      "selected JS source declaration identity",
      "surface target operation metadata",
    ]),
  ));
}

export function rejectSourceLibraryCallSignatureDeclarationMismatch(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_SOURCE_LIBRARY_CALL_SIGNATURE_DECLARATION_MISMATCH",
    9100114,
    `C# JS surface call '${sourceLibraryMemberIdentity(sourceMember)}' received mismatched selected TypeScript declaration and signature facts.`,
    missingSurfaceCallEvidence(sourceMember, "selected-declaration-signature-mismatch", [
      "matching selected source declaration fact",
      "matching selected source signature declaration fact",
    ]),
  ));
}

export function rejectSourceLibraryCallWithoutUniqueTargetMember(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  details?: unknown,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED",
    9100110,
    `C# JS surface could not map checked TypeScript library call '${sourceLibraryMemberIdentity(sourceMember)}' to a unique target member from finalized argument facts.`,
    missingSurfaceCallEvidence(sourceMember, "missing-unique-surface-target-member", [
      "surface target operation metadata",
      "finalized receiver carrier facts",
      "finalized argument carrier facts",
      "unambiguous generic selector result",
    ], details),
  ));
}

export function rejectSourceLibraryCallWithoutClosedArgumentFacts(
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
  argumentIndex: number,
): ExtensionObservation<CheckedCallMappingResult> {
  return rejectObservation(host.csharpProviderDiagnostic(
    host.extensionId,
    "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT",
    9100116,
    `C# JS surface call '${sourceLibraryMemberIdentity(sourceMember)}' requires finalized closed target facts for argument ${argumentIndex + 1}.`,
    missingSurfaceCallEvidence(sourceMember, "missing-finalized-argument-carrier", [
      "selected JS source declaration/signature identity",
      `finalized target carrier fact for argument ${argumentIndex + 1}`,
      "surface target operation metadata",
    ]),
  ));
}

function missingSurfaceCallEvidence(
  sourceMember: SourceLibraryMember,
  reason: string,
  requiredFacts: readonly string[],
  extraDetails?: unknown,
): readonly ExtensionEvidence[] {
  return [
    {
      message: "Missing JS surface call mapping evidence",
      details: {
        sourceIdentity: sourceLibraryMemberIdentity(sourceMember),
        reason,
        requiredFacts,
        capabilityIds: [
          "diagnostic.missing-target-fact",
          "diagnostic.unsupported-selected-surface-operation",
        ],
        ...(extraDetails === undefined ? {} : { extraDetails }),
      },
    },
  ];
}
