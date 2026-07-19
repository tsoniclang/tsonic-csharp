import type {
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  SelectedSourceTypeEvidence,
  SelectedSourceValueEvidence,
  SourceSelectedCallEvidence,
} from "@tsonic/tsts";

export type ApplicableSourceCallEvidence = Extract<SourceSelectedCallEvidence, { readonly kind: "applicable" }>;

export function getApplicableSourceCallEvidence(
  request: Pick<CheckedCallMappingRequest, "sourceSelection">,
): ApplicableSourceCallEvidence | undefined {
  return request.sourceSelection.kind === "applicable" ? request.sourceSelection : undefined;
}

export function getSelectedAccessEvidence(
  request: CheckedPropertyAccessMappingRequest | CheckedElementAccessMappingRequest,
): SelectedSourceValueEvidence | SelectedSourceTypeEvidence {
  return request.accessMode === "write" ? request.sourceWriteType : request.sourceReadResult;
}

export function getSelectedAccessReadResult(
  request: CheckedPropertyAccessMappingRequest | CheckedElementAccessMappingRequest,
): SelectedSourceValueEvidence | undefined {
  return request.accessMode === "write" ? undefined : request.sourceReadResult;
}
