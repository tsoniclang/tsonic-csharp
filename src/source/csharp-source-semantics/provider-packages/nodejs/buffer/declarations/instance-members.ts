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
  nodeBufferIncludesExportName,
  nodeBufferIncludesMemberId,
  nodeBufferIncludesSignatureId,
  nodeBufferIndexOfExportName,
  nodeBufferIndexOfMemberId,
  nodeBufferIndexOfSignatureId,
  nodeBufferLastIndexOfExportName,
  nodeBufferLastIndexOfMemberId,
  nodeBufferLastIndexOfSignatureId,
  nodeBufferLengthMemberId,
  nodeBufferReadUInt8ExportName,
  nodeBufferReadUInt8MemberId,
  nodeBufferReadUInt8SignatureId,
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
  nodeBufferWriteUInt8ExportName,
  nodeBufferWriteUInt8MemberId,
  nodeBufferWriteUInt8SignatureId,
} from "../identities.js";
import {
  nodeBufferBoolProviderType,
  nodeBufferNumberProviderType,
  nodeBufferProviderType,
  nodeBufferStringProviderType,
} from "../provider-types.js";
import {
  nodeBufferNumericInstanceMemberDeclarations,
} from "../numeric-members.js";

type ProviderClassMembers = NonNullable<ProviderExportDeclaration["members"]>;

export function nodeBufferInstanceMemberDeclarations(): ProviderClassMembers {
  const bufferSearchValueProviderType = {
    kind: "union",
    types: [
      nodeBufferStringProviderType,
      nodeBufferNumberProviderType,
      nodeBufferProviderType,
    ],
  } as const;
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
      id: nodeBufferIncludesMemberId,
      name: nodeBufferIncludesExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferIncludesSignatureId,
        parameters: [
          { name: "value", type: bufferSearchValueProviderType },
          { name: "byteOffset", type: nodeBufferNumberProviderType, optional: true },
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
        ],
        returnType: nodeBufferBoolProviderType,
      }],
    },
    {
      id: nodeBufferIndexOfMemberId,
      name: nodeBufferIndexOfExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferIndexOfSignatureId,
        parameters: [
          { name: "value", type: bufferSearchValueProviderType },
          { name: "byteOffset", type: nodeBufferNumberProviderType, optional: true },
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
        ],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    {
      id: nodeBufferLastIndexOfMemberId,
      name: nodeBufferLastIndexOfExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferLastIndexOfSignatureId,
        parameters: [
          { name: "value", type: bufferSearchValueProviderType },
          { name: "byteOffset", type: nodeBufferNumberProviderType, optional: true },
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
        ],
        returnType: nodeBufferNumberProviderType,
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
    {
      id: nodeBufferReadUInt8MemberId,
      name: nodeBufferReadUInt8ExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferReadUInt8SignatureId,
        parameters: [{ name: "offset", type: nodeBufferNumberProviderType, optional: true }],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    {
      id: nodeBufferWriteUInt8MemberId,
      name: nodeBufferWriteUInt8ExportName,
      kind: "method",
      signatures: [{
        id: nodeBufferWriteUInt8SignatureId,
        parameters: [
          { name: "value", type: nodeBufferNumberProviderType },
          { name: "offset", type: nodeBufferNumberProviderType, optional: true },
        ],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    ...nodeBufferNumericInstanceMemberDeclarations(),
  ];
}
