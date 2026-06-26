import type {
  TargetMember,
} from "@tsonic/tsts";
import type {
  NodejsClassCallTargetMember,
  NodejsClassPropertyTargetMember,
  NodejsModuleCallTargetMember,
} from "../members/types.js";
import {
  nodeBufferAllocMemberId,
  nodeBufferAllocSignatureId,
  nodeBufferAllocUnsafeMemberId,
  nodeBufferAllocUnsafeSignatureId,
  nodeBufferAllocUnsafeSlowMemberId,
  nodeBufferAllocUnsafeSlowSignatureId,
  nodeBufferAtobSignatureId,
  nodeBufferBtoaSignatureId,
  nodeBufferAtobExportName,
  nodeBufferBtoaExportName,
  nodeBufferByteLengthMemberId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthSignatureId,
  nodeBufferCompareMemberId,
  nodeBufferCompareExportName,
  nodeBufferCompareSignatureId,
  nodeBufferConcatMemberId,
  nodeBufferConcatExportName,
  nodeBufferConcatSignatureId,
  nodeBufferEqualsMemberId,
  nodeBufferEqualsExportName,
  nodeBufferEqualsSignatureId,
  nodeBufferExportName,
  nodeBufferAllocExportName,
  nodeBufferAllocUnsafeExportName,
  nodeBufferAllocUnsafeSlowExportName,
  nodeBufferFromStringMemberId,
  nodeBufferFromStringSignatureId,
  nodeBufferFromExportName,
  nodeBufferIsAsciiExportName,
  nodeBufferIsAsciiSignatureId,
  nodeBufferIsEncodingMemberId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingSignatureId,
  nodeBufferIsUtf8ExportName,
  nodeBufferIsUtf8SignatureId,
  nodeBufferLengthMemberId,
  nodeBufferOfExportName,
  nodeBufferOfMemberId,
  nodeBufferOfSignatureId,
  nodeBufferSliceExportName,
  nodeBufferSliceMemberId,
  nodeBufferSliceSignatureId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayMemberId,
  nodeBufferSubarraySignatureId,
  nodeBufferToStringExportName,
  nodeBufferToStringMemberId,
  nodeBufferToStringSignatureId,
} from "./identities.js";
import {
  getNodeBufferEqualsTargetMember,
  getNodeBufferLengthTargetMember,
  getNodeBufferSliceTargetMember,
  getNodeBufferSubarrayTargetMember,
  getNodeBufferToStringTargetMember,
} from "./instance-members.js";
import {
  getNodeBufferAllocTargetMember,
  getNodeBufferAllocUnsafeSlowTargetMember,
  getNodeBufferAllocUnsafeTargetMember,
  getNodeBufferAtobTargetMember,
  getNodeBufferBtoaTargetMember,
  getNodeBufferByteLengthTargetMember,
  getNodeBufferCompareTargetMember,
  getNodeBufferConcatTargetMember,
  getNodeBufferFromStringTargetMember,
  getNodeBufferIsAsciiTargetMember,
  getNodeBufferIsEncodingTargetMember,
  getNodeBufferIsUtf8TargetMember,
  getNodeBufferOfTargetMember,
} from "./static-members.js";

export {
  getNodeBufferLengthTargetMember,
} from "./instance-members.js";

export function nodeBufferModuleCallTargetMembers(): readonly NodejsModuleCallTargetMember[] {
  return [
    { exportName: nodeBufferAtobExportName, signatureId: nodeBufferAtobSignatureId, member: getNodeBufferAtobTargetMember() },
    { exportName: nodeBufferBtoaExportName, signatureId: nodeBufferBtoaSignatureId, member: getNodeBufferBtoaTargetMember() },
    { exportName: nodeBufferIsAsciiExportName, signatureId: nodeBufferIsAsciiSignatureId, member: getNodeBufferIsAsciiTargetMember() },
    { exportName: nodeBufferIsUtf8ExportName, signatureId: nodeBufferIsUtf8SignatureId, member: getNodeBufferIsUtf8TargetMember() },
  ];
}

export function nodeBufferClassCallTargetMembers(): readonly NodejsClassCallTargetMember[] {
  return [
    nodeBufferClassCallTargetMember(nodeBufferFromExportName, nodeBufferFromStringMemberId, nodeBufferFromStringSignatureId, getNodeBufferFromStringTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferAllocExportName, nodeBufferAllocMemberId, nodeBufferAllocSignatureId, getNodeBufferAllocTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferAllocUnsafeExportName, nodeBufferAllocUnsafeMemberId, nodeBufferAllocUnsafeSignatureId, getNodeBufferAllocUnsafeTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferAllocUnsafeSlowExportName, nodeBufferAllocUnsafeSlowMemberId, nodeBufferAllocUnsafeSlowSignatureId, getNodeBufferAllocUnsafeSlowTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferByteLengthExportName, nodeBufferByteLengthMemberId, nodeBufferByteLengthSignatureId, getNodeBufferByteLengthTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferCompareExportName, nodeBufferCompareMemberId, nodeBufferCompareSignatureId, getNodeBufferCompareTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferConcatExportName, nodeBufferConcatMemberId, nodeBufferConcatSignatureId, getNodeBufferConcatTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferIsEncodingExportName, nodeBufferIsEncodingMemberId, nodeBufferIsEncodingSignatureId, getNodeBufferIsEncodingTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferOfExportName, nodeBufferOfMemberId, nodeBufferOfSignatureId, getNodeBufferOfTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferEqualsExportName, nodeBufferEqualsMemberId, nodeBufferEqualsSignatureId, getNodeBufferEqualsTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferSliceExportName, nodeBufferSliceMemberId, nodeBufferSliceSignatureId, getNodeBufferSliceTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferSubarrayExportName, nodeBufferSubarrayMemberId, nodeBufferSubarraySignatureId, getNodeBufferSubarrayTargetMember()),
    nodeBufferClassCallTargetMember(nodeBufferToStringExportName, nodeBufferToStringMemberId, nodeBufferToStringSignatureId, getNodeBufferToStringTargetMember()),
  ];
}

export function nodeBufferClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    {
      exportName: nodeBufferExportName,
      memberName: "length",
      memberId: nodeBufferLengthMemberId,
      member: getNodeBufferLengthTargetMember(),
    },
  ];
}

export function getNodeBufferTargetMember(memberId: string | undefined, signatureId: string | undefined): TargetMember | undefined {
  return nodeBufferTargetMembersByIdentity.get(signatureId ?? memberId ?? "");
}

function nodeBufferClassCallTargetMember(
  memberName: string,
  memberId: string,
  signatureId: string,
  member: TargetMember,
): NodejsClassCallTargetMember {
  return {
    exportName: nodeBufferExportName,
    memberName,
    memberId,
    signatureId,
    member,
  };
}

const nodeBufferTargetMembersByIdentity = new Map<string, TargetMember>([
  [nodeBufferFromStringMemberId, getNodeBufferFromStringTargetMember()],
  [nodeBufferFromStringSignatureId, getNodeBufferFromStringTargetMember()],
  [nodeBufferAllocMemberId, getNodeBufferAllocTargetMember()],
  [nodeBufferAllocSignatureId, getNodeBufferAllocTargetMember()],
  [nodeBufferAllocUnsafeMemberId, getNodeBufferAllocUnsafeTargetMember()],
  [nodeBufferAllocUnsafeSignatureId, getNodeBufferAllocUnsafeTargetMember()],
  [nodeBufferAllocUnsafeSlowMemberId, getNodeBufferAllocUnsafeSlowTargetMember()],
  [nodeBufferAllocUnsafeSlowSignatureId, getNodeBufferAllocUnsafeSlowTargetMember()],
  [nodeBufferByteLengthMemberId, getNodeBufferByteLengthTargetMember()],
  [nodeBufferByteLengthSignatureId, getNodeBufferByteLengthTargetMember()],
  [nodeBufferCompareMemberId, getNodeBufferCompareTargetMember()],
  [nodeBufferCompareSignatureId, getNodeBufferCompareTargetMember()],
  [nodeBufferConcatMemberId, getNodeBufferConcatTargetMember()],
  [nodeBufferConcatSignatureId, getNodeBufferConcatTargetMember()],
  [nodeBufferEqualsMemberId, getNodeBufferEqualsTargetMember()],
  [nodeBufferEqualsSignatureId, getNodeBufferEqualsTargetMember()],
  [nodeBufferIsEncodingMemberId, getNodeBufferIsEncodingTargetMember()],
  [nodeBufferIsEncodingSignatureId, getNodeBufferIsEncodingTargetMember()],
  [nodeBufferLengthMemberId, getNodeBufferLengthTargetMember()],
  [nodeBufferOfMemberId, getNodeBufferOfTargetMember()],
  [nodeBufferOfSignatureId, getNodeBufferOfTargetMember()],
  [nodeBufferSliceMemberId, getNodeBufferSliceTargetMember()],
  [nodeBufferSliceSignatureId, getNodeBufferSliceTargetMember()],
  [nodeBufferSubarrayMemberId, getNodeBufferSubarrayTargetMember()],
  [nodeBufferSubarraySignatureId, getNodeBufferSubarrayTargetMember()],
  [nodeBufferToStringMemberId, getNodeBufferToStringTargetMember()],
  [nodeBufferToStringSignatureId, getNodeBufferToStringTargetMember()],
  [nodeBufferAtobSignatureId, getNodeBufferAtobTargetMember()],
  [nodeBufferBtoaSignatureId, getNodeBufferBtoaTargetMember()],
  [nodeBufferIsAsciiSignatureId, getNodeBufferIsAsciiTargetMember()],
  [nodeBufferIsUtf8SignatureId, getNodeBufferIsUtf8TargetMember()],
]);
