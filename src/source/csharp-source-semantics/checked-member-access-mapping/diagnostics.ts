import {
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  ExtensionObservation,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import type {
  UnsupportedProviderTargetMember,
} from "../provider-unsupported-members.js";
import {
  unsupportedProviderTargetMemberEvidence,
} from "../provider-unsupported-members.js";

export function rejectPropertyAccessNotMapped(
  extensionId: string,
  propertyName: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_PROPERTY_ACCESS_NOT_MAPPED", 9100144, `C# property access '${propertyName}' must be selected by TSTS/provider facts before emission.`));
}

export function rejectTargetPropertyUnsupported(
  extensionId: string,
  unsupportedMember: UnsupportedProviderTargetMember,
  targetId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_TARGET_PROPERTY_UNSUPPORTED",
    9100131,
    `C# provider selected unsupported target ${unsupportedMember.memberKind} '${unsupportedMember.targetName}' on target '${targetId}'. ${unsupportedMember.reason}`,
    unsupportedProviderTargetMemberEvidence(targetId, unsupportedMember),
  ));
}

export function rejectTargetPropertyNotFound(
  extensionId: string,
  propertyName: string,
  targetId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_FOUND", 9100102, `C# provider could not map checked property '${propertyName}' on target '${targetId}'.`));
}

export function rejectTargetEventUnsupported(
  extensionId: string,
  member: TargetMember,
  targetId: string,
  unsupportedMember: UnsupportedProviderTargetMember | undefined,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_TARGET_EVENT_UNSUPPORTED",
    9100132,
    `C# provider selected event '${member.targetName}' on target '${targetId}', but source event subscription semantics are not modeled.${unsupportedMember === undefined ? "" : ` ${unsupportedMember.reason}`}`,
    unsupportedMember === undefined
      ? [{
          message: "C# provider selected a target event before source event subscription semantics were modeled.",
          details: {
            bindingId: targetId,
            memberKind: member.kind,
            sourceName: member.sourceName,
            targetName: member.targetName,
            targetId: member.id,
          },
        }]
      : unsupportedProviderTargetMemberEvidence(targetId, unsupportedMember),
  ));
}

export function rejectTargetPropertyNotRenderable(
  extensionId: string,
  memberId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_PROPERTY_NOT_RENDERABLE", 9100105, `C# provider selected property '${memberId}', but no closed renderable C# target member fact could be produced from provider target identity.`));
}

export function rejectElementAccessNotMapped(
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_ELEMENT_ACCESS_NOT_MAPPED", 9100145, "C# element access must be selected by TSTS/provider facts before emission."));
}

export function rejectTargetIndexerUnsupported(
  extensionId: string,
  unsupportedMember: UnsupportedProviderTargetMember,
  targetId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(
    extensionId,
    "CSHARP_TARGET_INDEXER_UNSUPPORTED",
    9100133,
    `C# provider selected unsupported target ${unsupportedMember.memberKind} '${unsupportedMember.targetName}' on target '${targetId}'. ${unsupportedMember.reason}`,
    unsupportedProviderTargetMemberEvidence(targetId, unsupportedMember),
  ));
}

export function rejectTargetIndexerNotFound(
  extensionId: string,
  targetId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider could not map checked element access on target '${targetId}' from selected TSTS provider index declaration identity.`));
}

export function rejectNonIndexerSelectedForElementAccess(
  extensionId: string,
  memberId: string,
  targetId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, `C# provider selected non-indexer member '${memberId}' for checked element access on target '${targetId}'.`));
}

export function rejectTargetIndexerNotRenderable(
  extensionId: string,
  memberId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_RENDERABLE", 9100106, `C# provider selected indexer '${memberId}', but no closed renderable C# target member fact could be produced from provider target identity.`));
}

export function rejectNativeArrayPropertyNotSupported(
  extensionId: string,
  propertyName: string,
  requireSelectedSurfaceCarrier: boolean = false,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED", 9100136, `C# native array source contract has no target-backed property '${propertyName}'.${requireSelectedSurfaceCarrier ? " JavaScript array properties require an explicit selected surface carrier." : ""}`));
}

export function rejectNativeArrayIndexerNotFound(
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TARGET_INDEXER_NOT_FOUND", 9100103, "C# native array element access requires the selected provider-owned native array indexer declaration."));
}

export function rejectNonIntegralNativeArrayIndex(
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100109, "C# native array element access requires an integral TSTS/provider-backed index type."));
}

export function rejectNonIntegralSourceArrayIndex(
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100109, "C# source array element access requires an integral TSTS/provider-backed index type."));
}

export function rejectTupleElementIndexNotProven(
  extensionId: string,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TUPLE_ELEMENT_INDEX_NOT_PROVEN", 9100146, "C# source tuple element access requires a statically proven non-negative integer tuple index from TSTS literal or constant facts."));
}

export function rejectTupleElementCarrierMissing(
  extensionId: string,
  index: number,
): ExtensionObservation<CheckedOperationMappingResult> {
  return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_TUPLE_ELEMENT_CARRIER_MISSING", 9100147, `C# source tuple element access index ${index} requires a finalized tuple element carrier fact.`));
}
