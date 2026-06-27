import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeBufferCompareInstanceExportName,
  nodeBufferCompareInstanceMemberId,
  nodeBufferCompareInstanceSignatureId,
  nodeBufferCopyExportName,
  nodeBufferCopyMemberId,
  nodeBufferCopySignatureId,
  nodeBufferEqualsExportName,
  nodeBufferEqualsMemberId,
  nodeBufferEqualsSignatureId,
  nodeBufferLengthMemberId,
  nodeBufferSliceExportName,
  nodeBufferSliceMemberId,
  nodeBufferSliceSignatureId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayMemberId,
  nodeBufferSubarraySignatureId,
  nodeBufferToStringExportName,
  nodeBufferToStringMemberId,
  nodeBufferToStringSignatureId,
  nodeBufferWriteExportName,
  nodeBufferWriteMemberId,
  nodeBufferWriteSignatureId,
} from "../identities.js";
import {
  nodeBufferBoolProviderType,
  nodeBufferNumberProviderType,
  nodeBufferProviderType,
  nodeBufferStringProviderType,
} from "../provider-types.js";

type ProviderClassMembers = NonNullable<ProviderExportDeclaration["members"]>;

export function nodeBufferInstanceMemberDeclarations(): ProviderClassMembers {
  return [
    {
      id: nodeBufferLengthMemberId,
      name: "length",
      kind: "property",
      readonly: true,
      type: nodeBufferNumberProviderType,
    },
    {
      id: nodeBufferCompareInstanceMemberId,
      name: nodeBufferCompareInstanceExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferCompareInstanceSignatureId,
        parameters: [{ name: "target", type: nodeBufferProviderType }],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    {
      id: nodeBufferCopyMemberId,
      name: nodeBufferCopyExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferCopySignatureId,
        parameters: [
          { name: "target", type: nodeBufferProviderType },
          { name: "targetStart", type: nodeBufferNumberProviderType, optional: true },
          { name: "sourceStart", type: nodeBufferNumberProviderType, optional: true },
          { name: "sourceEnd", type: nodeBufferNumberProviderType, optional: true },
        ],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    {
      id: nodeBufferEqualsMemberId,
      name: nodeBufferEqualsExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferEqualsSignatureId,
        parameters: [{ name: "otherBuffer", type: nodeBufferProviderType }],
        returnType: nodeBufferBoolProviderType,
      }],
    },
    {
      id: nodeBufferSliceMemberId,
      name: nodeBufferSliceExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferSliceSignatureId,
        parameters: [
          { name: "start", type: nodeBufferNumberProviderType, optional: true },
          { name: "end", type: nodeBufferNumberProviderType, optional: true },
        ],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferSubarrayMemberId,
      name: nodeBufferSubarrayExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferSubarraySignatureId,
        parameters: [
          { name: "start", type: nodeBufferNumberProviderType, optional: true },
          { name: "end", type: nodeBufferNumberProviderType, optional: true },
        ],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferToStringMemberId,
      name: nodeBufferToStringExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferToStringSignatureId,
        parameters: [
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
          { name: "start", type: nodeBufferNumberProviderType, optional: true },
          { name: "end", type: nodeBufferNumberProviderType, optional: true },
        ],
        returnType: nodeBufferStringProviderType,
      }],
    },
    {
      id: nodeBufferWriteMemberId,
      name: nodeBufferWriteExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferWriteSignatureId,
        parameters: [
          { name: "str", type: nodeBufferStringProviderType },
          { name: "offset", type: nodeBufferNumberProviderType, optional: true },
          { name: "length", type: nodeBufferNumberProviderType, optional: true },
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
        ],
        returnType: nodeBufferNumberProviderType,
      }],
    },
  ];
}
