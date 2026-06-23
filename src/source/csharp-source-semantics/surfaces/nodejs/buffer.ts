import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const bufferProviderType = { kind: "provider-ref", name: "Buffer" } satisfies ProviderTypeExpression;

const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const bufferTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Buffer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Buffer"));
const bufferModuleTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.buffer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "buffer"));

export const nodeBufferModuleSpecifier = "node:buffer";
export const nodeBufferExportName = "Buffer";
export const nodeBufferFromExportName = "from";
export const nodeBufferFromStringMemberId = "node:buffer.Buffer.from";
export const nodeBufferFromStringSignatureId = "node:buffer.Buffer.from(System.String,System.String)";
export const nodeBufferAllocExportName = "alloc";
export const nodeBufferAllocMemberId = "node:buffer.Buffer.alloc";
export const nodeBufferAllocSignatureId = "node:buffer.Buffer.alloc(System.Int32)";
export const nodeBufferByteLengthExportName = "byteLength";
export const nodeBufferByteLengthMemberId = "node:buffer.Buffer.byteLength";
export const nodeBufferByteLengthSignatureId = "node:buffer.Buffer.byteLength(System.String,System.String)";
export const nodeBufferLengthMemberId = "node:buffer.Buffer.length";
export const nodeBufferToStringExportName = "toString";
export const nodeBufferToStringMemberId = "node:buffer.Buffer.toString";
export const nodeBufferToStringSignatureId = "node:buffer.Buffer.toString(System.String,System.Int32,System.Nullable`1)";

export function nodeBufferExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:buffer.Buffer",
      name: nodeBufferExportName,
      kind: "class",
      members: [
        {
          id: nodeBufferFromStringMemberId,
          name: nodeBufferFromExportName,
          kind: "method",
          static: true,
          signatures: [{
            id: nodeBufferFromStringSignatureId,
            parameters: [
              { name: "value", type: stringProviderType },
              { name: "encoding", type: stringProviderType, optional: true },
            ],
            returnType: bufferProviderType,
          }],
        },
        {
          id: nodeBufferAllocMemberId,
          name: nodeBufferAllocExportName,
          kind: "method",
          static: true,
          signatures: [{
            id: nodeBufferAllocSignatureId,
            parameters: [{ name: "size", type: numberProviderType }],
            returnType: bufferProviderType,
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
              { name: "value", type: stringProviderType },
              { name: "encoding", type: stringProviderType, optional: true },
            ],
            returnType: numberProviderType,
          }],
        },
        {
          id: nodeBufferLengthMemberId,
          name: "length",
          kind: "property",
          readonly: true,
          type: numberProviderType,
        },
        {
          id: nodeBufferToStringMemberId,
          name: nodeBufferToStringExportName,
          kind: "method",
          signatures: [{
            id: nodeBufferToStringSignatureId,
            parameters: [
              { name: "encoding", type: stringProviderType, optional: true },
              { name: "start", type: numberProviderType, optional: true },
              { name: "end", type: numberProviderType, optional: true },
            ],
            returnType: stringProviderType,
          }],
        },
      ],
    },
    {
      id: "node:buffer.atob",
      name: "atob",
      kind: "function",
      signatures: [{
        id: "node:buffer.atob(System.String)",
        parameters: [{ name: "data", type: stringProviderType }],
        returnType: stringProviderType,
      }],
    },
    {
      id: "node:buffer.btoa",
      name: "btoa",
      kind: "function",
      signatures: [{
        id: "node:buffer.btoa(System.String)",
        parameters: [{ name: "data", type: stringProviderType }],
        returnType: stringProviderType,
      }],
    },
    {
      id: "node:buffer.isAscii",
      name: "isAscii",
      kind: "function",
      signatures: [{
        id: "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)",
        parameters: [{ name: "value", type: bufferProviderType }],
        returnType: boolProviderType,
      }],
    },
    {
      id: "node:buffer.isUtf8",
      name: "isUtf8",
      kind: "function",
      signatures: [{
        id: "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)",
        parameters: [{ name: "value", type: bufferProviderType }],
        returnType: boolProviderType,
      }],
    },
  ];
}

export function getNodeBufferTargetMember(memberId: string | undefined, signatureId: string | undefined): TargetMember | undefined {
  return nodeBufferTargetMembersByIdentity.get(signatureId ?? memberId ?? "");
}

export function getNodeBufferLengthTargetMember(): TargetMember {
  return targetProperty(
    "Tsonic.CSharp.Node.Buffer.length",
    "length",
    "length",
    intTargetType,
    {
      declaringType: bufferTargetType,
    },
  );
}

function getNodeBufferFromStringTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.from(System.String,System.String)",
    nodeBufferFromExportName,
    nodeBufferFromExportName,
    [
      targetParameter("value", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ],
    bufferTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferAllocTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.alloc(System.Int32)",
    nodeBufferAllocExportName,
    nodeBufferAllocExportName,
    [targetParameter("size", intTargetType)],
    bufferTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferByteLengthTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.byteLength(System.String,System.String)",
    nodeBufferByteLengthExportName,
    nodeBufferByteLengthExportName,
    [
      targetParameter("value", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ],
    intTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferToStringTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.toString(System.String,System.Int32,System.Nullable`1)",
    nodeBufferToStringExportName,
    nodeBufferToStringExportName,
    [
      targetParameter("encoding", stringTargetType, { optional: true }),
      targetParameter("start", intTargetType, { optional: true }),
      targetParameter("end", csharpTargetNamedType("System.Nullable`1", [intTargetType], { kind: "nullable" }), { optional: true }),
    ],
    stringTargetType,
    {
      declaringType: bufferTargetType,
    },
  );
}

const nodeBufferTargetMembersByIdentity = new Map<string, TargetMember>([
  [nodeBufferFromStringMemberId, getNodeBufferFromStringTargetMember()],
  [nodeBufferFromStringSignatureId, getNodeBufferFromStringTargetMember()],
  [nodeBufferAllocMemberId, getNodeBufferAllocTargetMember()],
  [nodeBufferAllocSignatureId, getNodeBufferAllocTargetMember()],
  [nodeBufferByteLengthMemberId, getNodeBufferByteLengthTargetMember()],
  [nodeBufferByteLengthSignatureId, getNodeBufferByteLengthTargetMember()],
  [nodeBufferLengthMemberId, getNodeBufferLengthTargetMember()],
  [nodeBufferToStringMemberId, getNodeBufferToStringTargetMember()],
  [nodeBufferToStringSignatureId, getNodeBufferToStringTargetMember()],
  ["node:buffer.atob(System.String)", targetMethod("Tsonic.CSharp.Node.buffer.atob(System.String)", "atob", "atob", [targetParameter("data", stringTargetType)], stringTargetType, {
    declaringType: bufferModuleTargetType,
    static: true,
  })],
  ["node:buffer.btoa(System.String)", targetMethod("Tsonic.CSharp.Node.buffer.btoa(System.String)", "btoa", "btoa", [targetParameter("data", stringTargetType)], stringTargetType, {
    declaringType: bufferModuleTargetType,
    static: true,
  })],
  ["node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)", targetMethod("Tsonic.CSharp.Node.buffer.isAscii(Tsonic.CSharp.Node.Buffer)", "isAscii", "isAscii", [targetParameter("value", bufferTargetType)], boolTargetType, {
    declaringType: bufferModuleTargetType,
    static: true,
  })],
  ["node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)", targetMethod("Tsonic.CSharp.Node.buffer.isUtf8(Tsonic.CSharp.Node.Buffer)", "isUtf8", "isUtf8", [targetParameter("value", bufferTargetType)], boolTargetType, {
    declaringType: bufferModuleTargetType,
    static: true,
  })],
]);
