import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpNullableValueTargetType,
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
export const nodeBufferAllocUnsafeExportName = "allocUnsafe";
export const nodeBufferAllocUnsafeMemberId = "node:buffer.Buffer.allocUnsafe";
export const nodeBufferAllocUnsafeSignatureId = "node:buffer.Buffer.allocUnsafe(System.Int32)";
export const nodeBufferAllocUnsafeSlowExportName = "allocUnsafeSlow";
export const nodeBufferAllocUnsafeSlowMemberId = "node:buffer.Buffer.allocUnsafeSlow";
export const nodeBufferAllocUnsafeSlowSignatureId = "node:buffer.Buffer.allocUnsafeSlow(System.Int32)";
export const nodeBufferByteLengthExportName = "byteLength";
export const nodeBufferByteLengthMemberId = "node:buffer.Buffer.byteLength";
export const nodeBufferByteLengthSignatureId = "node:buffer.Buffer.byteLength(System.String,System.String)";
export const nodeBufferCompareExportName = "compare";
export const nodeBufferCompareMemberId = "node:buffer.Buffer.compare";
export const nodeBufferCompareSignatureId = "node:buffer.Buffer.compare(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)";
export const nodeBufferConcatExportName = "concat";
export const nodeBufferConcatMemberId = "node:buffer.Buffer.concat";
export const nodeBufferConcatSignatureId = "node:buffer.Buffer.concat(Tsonic.CSharp.Node.Buffer[],System.Nullable`1)";
export const nodeBufferEqualsExportName = "equals";
export const nodeBufferEqualsMemberId = "node:buffer.Buffer.equals";
export const nodeBufferEqualsSignatureId = "node:buffer.Buffer.equals(Tsonic.CSharp.Node.Buffer)";
export const nodeBufferIsEncodingExportName = "isEncoding";
export const nodeBufferIsEncodingMemberId = "node:buffer.Buffer.isEncoding";
export const nodeBufferIsEncodingSignatureId = "node:buffer.Buffer.isEncoding(System.String)";
export const nodeBufferLengthMemberId = "node:buffer.Buffer.length";
export const nodeBufferOfExportName = "of";
export const nodeBufferOfMemberId = "node:buffer.Buffer.of";
export const nodeBufferOfSignatureId = "node:buffer.Buffer.of(System.Int32[])";
export const nodeBufferSliceExportName = "slice";
export const nodeBufferSliceMemberId = "node:buffer.Buffer.slice";
export const nodeBufferSliceSignatureId = "node:buffer.Buffer.slice(System.Nullable`1,System.Nullable`1)";
export const nodeBufferSubarrayExportName = "subarray";
export const nodeBufferSubarrayMemberId = "node:buffer.Buffer.subarray";
export const nodeBufferSubarraySignatureId = "node:buffer.Buffer.subarray(System.Nullable`1,System.Nullable`1)";
export const nodeBufferToStringExportName = "toString";
export const nodeBufferToStringMemberId = "node:buffer.Buffer.toString";
export const nodeBufferToStringSignatureId = "node:buffer.Buffer.toString(System.String,System.Int32,System.Nullable`1)";

export function nodeBufferExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:buffer.Buffer",
      name: nodeBufferExportName,
      kind: "class",
      targetIdentity: {
        target: "csharp",
        id: bufferTargetType.id,
        displayName: "Tsonic.CSharp.Node.Buffer",
      },
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
          id: nodeBufferAllocUnsafeMemberId,
          name: nodeBufferAllocUnsafeExportName,
          kind: "method",
          static: true,
          signatures: [{
            id: nodeBufferAllocUnsafeSignatureId,
            parameters: [{ name: "size", type: numberProviderType }],
            returnType: bufferProviderType,
          }],
        },
        {
          id: nodeBufferAllocUnsafeSlowMemberId,
          name: nodeBufferAllocUnsafeSlowExportName,
          kind: "method",
          static: true,
          signatures: [{
            id: nodeBufferAllocUnsafeSlowSignatureId,
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
          id: nodeBufferCompareMemberId,
          name: nodeBufferCompareExportName,
          kind: "method",
          static: true,
          signatures: [{
            id: nodeBufferCompareSignatureId,
            parameters: [
              { name: "buf1", type: bufferProviderType },
              { name: "buf2", type: bufferProviderType },
            ],
            returnType: numberProviderType,
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
              { name: "list", type: { kind: "array", elementType: bufferProviderType } },
              { name: "totalLength", type: numberProviderType, optional: true },
            ],
            returnType: bufferProviderType,
          }],
        },
        {
          id: nodeBufferIsEncodingMemberId,
          name: nodeBufferIsEncodingExportName,
          kind: "method",
          static: true,
          signatures: [{
            id: nodeBufferIsEncodingSignatureId,
            parameters: [{ name: "encoding", type: stringProviderType }],
            returnType: boolProviderType,
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
              type: { kind: "array", elementType: numberProviderType },
              rest: true,
            }],
            returnType: bufferProviderType,
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
          id: nodeBufferEqualsMemberId,
          name: nodeBufferEqualsExportName,
          kind: "method",
          signatures: [{
            id: nodeBufferEqualsSignatureId,
            parameters: [{ name: "otherBuffer", type: bufferProviderType }],
            returnType: boolProviderType,
          }],
        },
        {
          id: nodeBufferSliceMemberId,
          name: nodeBufferSliceExportName,
          kind: "method",
          signatures: [{
            id: nodeBufferSliceSignatureId,
            parameters: [
              { name: "start", type: numberProviderType, optional: true },
              { name: "end", type: numberProviderType, optional: true },
            ],
            returnType: bufferProviderType,
          }],
        },
        {
          id: nodeBufferSubarrayMemberId,
          name: nodeBufferSubarrayExportName,
          kind: "method",
          signatures: [{
            id: nodeBufferSubarraySignatureId,
            parameters: [
              { name: "start", type: numberProviderType, optional: true },
              { name: "end", type: numberProviderType, optional: true },
            ],
            returnType: bufferProviderType,
          }],
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

function getNodeBufferAllocUnsafeTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.allocUnsafe(System.Int32)",
    nodeBufferAllocUnsafeExportName,
    nodeBufferAllocUnsafeExportName,
    [targetParameter("size", intTargetType)],
    bufferTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferAllocUnsafeSlowTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.allocUnsafeSlow(System.Int32)",
    nodeBufferAllocUnsafeSlowExportName,
    nodeBufferAllocUnsafeSlowExportName,
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

function getNodeBufferCompareTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.compare(Tsonic.CSharp.Node.Buffer,Tsonic.CSharp.Node.Buffer)",
    nodeBufferCompareExportName,
    nodeBufferCompareExportName,
    [
      targetParameter("buf1", bufferTargetType),
      targetParameter("buf2", bufferTargetType),
    ],
    intTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferConcatTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.concat(Tsonic.CSharp.Node.Buffer[],System.Nullable`1)",
    nodeBufferConcatExportName,
    nodeBufferConcatExportName,
    [
      targetParameter("list", { kind: "array", element: bufferTargetType }),
      targetParameter("totalLength", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ],
    bufferTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferIsEncodingTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.isEncoding(System.String)",
    nodeBufferIsEncodingExportName,
    nodeBufferIsEncodingExportName,
    [targetParameter("encoding", stringTargetType)],
    boolTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferOfTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.of(System.Int32[])",
    nodeBufferOfExportName,
    nodeBufferOfExportName,
    [targetParameter("items", intTargetType, { paramsArray: true })],
    bufferTargetType,
    {
      declaringType: bufferTargetType,
      static: true,
    },
  );
}

function getNodeBufferEqualsTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.Buffer.equals(Tsonic.CSharp.Node.Buffer)",
    nodeBufferEqualsExportName,
    nodeBufferEqualsExportName,
    [targetParameter("otherBuffer", bufferTargetType)],
    boolTargetType,
    {
      declaringType: bufferTargetType,
    },
  );
}

function getNodeBufferSliceTargetMember(): TargetMember {
  return nodeBufferRangeTargetMember(nodeBufferSliceExportName, "slice");
}

function getNodeBufferSubarrayTargetMember(): TargetMember {
  return nodeBufferRangeTargetMember(nodeBufferSubarrayExportName, "subarray");
}

function nodeBufferRangeTargetMember(sourceName: string, targetName: string): TargetMember {
  return targetMethod(
    `Tsonic.CSharp.Node.Buffer.${sourceName}(System.Nullable\`1,System.Nullable\`1)`,
    sourceName,
    targetName,
    [
      targetParameter("start", csharpNullableValueTargetType(intTargetType), { optional: true }),
      targetParameter("end", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ],
    bufferTargetType,
    {
      declaringType: bufferTargetType,
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
