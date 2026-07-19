import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  recordCsharpRuntimeCarrierFact,
} from "../../../../csharp-facts.js";
import {
  csharpTargetMemberFact,
} from "../../../target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
} from "../../../target-ref-utils.js";

export type CsharpRequestCarrierFactWrite = "not-proven" | "recorded" | "conflict";

export function recordUniqueSelectedCallReceiverCarrier(
  request: CheckedCallMappingRequest,
  candidates: readonly TargetMember[],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): CsharpRequestCarrierFactWrite {
  const receiver = request.sourceReceiver?.expression;
  if (receiver === undefined || candidates.length === 0) {
    return "not-proven";
  }
  const candidateReceiverTypes = candidates.map(selectedTargetReceiverType);
  if (candidateReceiverTypes.some((candidate) => candidate === undefined)) {
    return "not-proven";
  }
  const uniqueReceiverTypes: TargetTypeRef[] = [];
  for (const candidate of candidateReceiverTypes) {
    if (candidate !== undefined && !uniqueReceiverTypes.some((existing) => targetTypeRefEquals(existing, candidate))) {
      uniqueReceiverTypes.push(candidate);
    }
  }
  if (uniqueReceiverTypes.length !== 1) {
    return "not-proven";
  }
  const carrier = uniqueReceiverTypes[0];
  if (carrier === undefined || !targetTypeRefIsClosed(carrier)) {
    return "not-proven";
  }
  const write = recordCsharpRuntimeCarrierFact(context.facts, receiver, { carrier }, [{
    message: "C# checked call receiver carrier recorded from one exact target receiver type shared by every selected-source target candidate.",
  }]);
  return write === "inserted" || write === "idempotent" ? "recorded" : "conflict";
}

export function recordSelectedCallResultCarrier(
  request: CheckedCallMappingRequest,
  member: TargetMember,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): CsharpRequestCarrierFactWrite {
  const carrier = csharpTargetMemberFact(member)?.returnType;
  if (carrier === undefined) {
    return "not-proven";
  }
  const write = recordCsharpRuntimeCarrierFact(context.facts, request.sourceResult.expression, { carrier }, [{
    message: "C# checked call result carrier recorded from the exact selected target member return type.",
  }]);
  return write === "inserted" || write === "idempotent" ? "recorded" : "conflict";
}

function selectedTargetReceiverType(member: TargetMember): TargetTypeRef | undefined {
  const csharpMember = csharpTargetMemberFact(member);
  if (csharpMember === undefined) {
    return undefined;
  }
  return csharpMember.receiverPassing === "first-argument"
    ? csharpMember.parameters[0]?.type
    : csharpMember.declaringType;
}
