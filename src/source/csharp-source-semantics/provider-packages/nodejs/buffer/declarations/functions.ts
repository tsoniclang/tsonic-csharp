import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeBufferAtobExportName,
  nodeBufferAtobSignatureId,
  nodeBufferBtoaExportName,
  nodeBufferBtoaSignatureId,
  nodeBufferIsAsciiExportName,
  nodeBufferIsAsciiSignatureId,
  nodeBufferIsUtf8ExportName,
  nodeBufferIsUtf8SignatureId,
  nodeBufferTranscodeExportName,
  nodeBufferTranscodeSignatureId,
} from "../identities.js";
import {
  nodeBufferBoolProviderType,
  nodeBufferProviderType,
  nodeBufferStringProviderType,
} from "../provider-types.js";
import {
  nodeBufferUnsupportedFunctionExports,
} from "../unsupported.js";

export function nodeBufferFunctionExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:buffer.atob",
      name: nodeBufferAtobExportName,
      kind: "function",
      signatures: [{
        id: nodeBufferAtobSignatureId,
        parameters: [{ name: "data", type: nodeBufferStringProviderType }],
        returnType: nodeBufferStringProviderType,
      }],
    },
    {
      id: "node:buffer.btoa",
      name: nodeBufferBtoaExportName,
      kind: "function",
      signatures: [{
        id: nodeBufferBtoaSignatureId,
        parameters: [{ name: "data", type: nodeBufferStringProviderType }],
        returnType: nodeBufferStringProviderType,
      }],
    },
    {
      id: "node:buffer.isAscii",
      name: nodeBufferIsAsciiExportName,
      kind: "function",
      signatures: [{
        id: nodeBufferIsAsciiSignatureId,
        parameters: [{ name: "value", type: nodeBufferProviderType }],
        returnType: nodeBufferBoolProviderType,
      }],
    },
    {
      id: "node:buffer.isUtf8",
      name: nodeBufferIsUtf8ExportName,
      kind: "function",
      signatures: [{
        id: nodeBufferIsUtf8SignatureId,
        parameters: [{ name: "value", type: nodeBufferProviderType }],
        returnType: nodeBufferBoolProviderType,
      }],
    },
    {
      id: "node:buffer.transcode",
      name: nodeBufferTranscodeExportName,
      kind: "function",
      signatures: [{
        id: nodeBufferTranscodeSignatureId,
        parameters: [
          { name: "source", type: nodeBufferProviderType },
          { name: "fromEncoding", type: nodeBufferStringProviderType },
          { name: "toEncoding", type: nodeBufferStringProviderType },
        ],
        returnType: nodeBufferProviderType,
      }],
    },
    ...nodeBufferUnsupportedFunctionExports(),
  ];
}
