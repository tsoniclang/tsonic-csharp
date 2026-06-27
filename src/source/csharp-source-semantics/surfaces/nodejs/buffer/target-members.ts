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
