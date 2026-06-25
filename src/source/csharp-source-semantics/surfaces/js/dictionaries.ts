import {
  acceptObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFromMember,
  recordCsharpTargetOperation,
  targetOperationFromMember,
} from "./source-library.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  getCsharpRecordDictionaryIndexerTargetMembers,
  isCsharpRecordDictionaryTargetType,
} from "../../dictionaries.js";

export function mapCsharpJsRecordDictionaryElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (!isCsharpRecordDictionaryTargetType(receiverType)) {
    return undefined;
  }
  if (host.getCsharpTargetBindingByTargetId === undefined || host.getCsharpTargetBindingByMetadataName === undefined) {
    return undefined;
  }
  const candidates = getCsharpRecordDictionaryIndexerTargetMembers(receiverType, {
    getCsharpTargetBindingByTargetId: host.getCsharpTargetBindingByTargetId,
    getCsharpTargetBindingByMetadataName: host.getCsharpTargetBindingByMetadataName,
  });
  const member = candidates.length === 1
    ? candidates[0]
    : host.selectTargetMember(candidates, { arguments: [request.argument] }, context);
  if (member === undefined) {
    return rejectObservation({
      ...host.csharpProviderDiagnostic(host.extensionId, "CSHARP_RECORD_DICTIONARY_INDEXER_NOT_MAPPED", 9100114, "C# Record dictionary surface could not map checked TypeScript element access to a provider-owned Dictionary indexer from finalized key facts."),
      evidence: [
        { message: "Record dictionary receiver target type", details: receiverType },
        { message: "Candidate indexer ids", details: candidates.map((candidate) => candidate.id) },
        { message: "Argument target type", details: host.getTargetTypeRefForSubject(request.argument, context) ?? "unresolved" },
      ],
    });
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: "C# Record dictionary indexer operation recorded from checked TypeScript Record carrier and provider-owned Dictionary indexer facts." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperationFromMember(member),
  }, [{ message: "C# Record dictionary indexer selected from checked TypeScript Record carrier and provider-owned Dictionary indexer facts." }]);
}
