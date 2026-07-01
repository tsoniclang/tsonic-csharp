import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeBufferAllocExportName,
  nodeBufferAllocMemberId,
  nodeBufferAllocSignatureId,
  nodeBufferAllocUnsafeExportName,
  nodeBufferAllocUnsafeMemberId,
  nodeBufferAllocUnsafeSignatureId,
  nodeBufferAllocUnsafeSlowExportName,
  nodeBufferAllocUnsafeSlowMemberId,
  nodeBufferAllocUnsafeSlowSignatureId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthMemberId,
  nodeBufferByteLengthSignatureId,
  nodeBufferCompareExportName,
  nodeBufferCompareMemberId,
  nodeBufferCompareSignatureId,
  nodeBufferConcatExportName,
  nodeBufferConcatMemberId,
  nodeBufferConcatSignatureId,
  nodeBufferFromExportName,
  nodeBufferFromBufferSignatureId,
  nodeBufferFromNumberArraySignatureId,
  nodeBufferFromStringMemberId,
  nodeBufferFromStringSignatureId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingMemberId,
  nodeBufferIsEncodingSignatureId,
  nodeBufferOfExportName,
  nodeBufferOfMemberId,
  nodeBufferOfSignatureId,
} from "../identities.js";
import {
  nodeBufferBoolProviderType,
  nodeBufferNumberProviderType,
  nodeBufferProviderType,
  nodeBufferStringProviderType,
} from "../provider-types.js";

type ProviderClassMembers = NonNullable<ProviderExportDeclaration["members"]>;

export function nodeBufferStaticMemberDeclarations(): ProviderClassMembers {
  return [
    {
      id: nodeBufferFromStringMemberId,
      name: nodeBufferFromExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferFromStringSignatureId,
        parameters: [
          { name: "value", type: nodeBufferStringProviderType },
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
        ],
        returnType: nodeBufferProviderType,
      }, {
        id: nodeBufferFromNumberArraySignatureId,
        parameters: [
          { name: "array", type: { kind: "array", elementType: nodeBufferNumberProviderType } },
        ],
        returnType: nodeBufferProviderType,
      }, {
        id: nodeBufferFromBufferSignatureId,
        parameters: [
          { name: "buffer", type: nodeBufferProviderType },
        ],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferAllocMemberId,
      name: nodeBufferAllocExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferAllocSignatureId,
        parameters: [{ name: "size", type: nodeBufferNumberProviderType }],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferAllocUnsafeMemberId,
      name: nodeBufferAllocUnsafeExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferAllocUnsafeSignatureId,
        parameters: [{ name: "size", type: nodeBufferNumberProviderType }],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferAllocUnsafeSlowMemberId,
      name: nodeBufferAllocUnsafeSlowExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferAllocUnsafeSlowSignatureId,
        parameters: [{ name: "size", type: nodeBufferNumberProviderType }],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferByteLengthMemberId,
      name: nodeBufferByteLengthExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferByteLengthSignatureId,
        parameters: [
          { name: "value", type: nodeBufferStringProviderType },
          { name: "encoding", type: nodeBufferStringProviderType, optional: true },
        ],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    {
      id: nodeBufferCompareMemberId,
      name: nodeBufferCompareExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferCompareSignatureId,
        parameters: [
          { name: "buf1", type: nodeBufferProviderType },
          { name: "buf2", type: nodeBufferProviderType },
        ],
        returnType: nodeBufferNumberProviderType,
      }],
    },
    {
      id: nodeBufferConcatMemberId,
      name: nodeBufferConcatExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferConcatSignatureId,
        parameters: [
          { name: "list", type: { kind: "array", elementType: nodeBufferProviderType } },
          { name: "totalLength", type: nodeBufferNumberProviderType, optional: true },
        ],
        returnType: nodeBufferProviderType,
      }],
    },
    {
      id: nodeBufferIsEncodingMemberId,
      name: nodeBufferIsEncodingExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferIsEncodingSignatureId,
        parameters: [{ name: "encoding", type: nodeBufferStringProviderType }],
        returnType: nodeBufferBoolProviderType,
      }],
    },
    {
      id: nodeBufferOfMemberId,
      name: nodeBufferOfExportName,
      kind: "method",
      static: true,
      signatures: [{
        id: nodeBufferOfSignatureId,
        parameters: [{
          name: "items",
          type: { kind: "array", elementType: nodeBufferNumberProviderType },
          rest: true,
        }],
        returnType: nodeBufferProviderType,
      }],
    },
  ];
}
