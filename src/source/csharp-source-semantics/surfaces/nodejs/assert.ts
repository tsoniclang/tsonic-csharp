import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetParameter,
} from "../js/source-library.js";
import {
  getNodejsProviderExportSignatureDeclarationMetadata,
  nodejsProviderExportSignatureDeclarationMetadataIndex,
} from "./metadata-indexes.js";

const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const callbackProviderType = {
  kind: "function",
  parameters: [],
  returnType: unknownProviderType,
} satisfies ProviderTypeExpression;
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const stringTargetType = csharpStringTargetType();
const voidTargetType = csharpVoidTargetType();
const assertTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.assert", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "assert"));

export interface NodeAssertCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export interface NodeAssertUnsupportedTargetIdentity {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
}

export const nodeAssertModuleSpecifier = "node:assert";
export const nodeAssertOkExportName = "ok";
export const nodeAssertOkSignatureId = "node:assert.ok(System.Boolean,System.String)";
export const nodeAssertFailExportName = "fail";
export const nodeAssertFailSignatureId = "node:assert.fail(System.String)";
export const nodeAssertStrictEqualExportName = "strictEqual";
export const nodeAssertStrictEqualSignatureId = "node:assert.strictEqual(System.Object,System.Object,System.String)";
export const nodeAssertNotStrictEqualExportName = "notStrictEqual";
export const nodeAssertNotStrictEqualSignatureId = "node:assert.notStrictEqual(System.Object,System.Object,System.String)";
export const nodeAssertEqualExportName = "equal";
export const nodeAssertEqualSignatureId = "node:assert.equal(System.Object,System.Object,System.String)";
export const nodeAssertNotEqualExportName = "notEqual";
export const nodeAssertNotEqualSignatureId = "node:assert.notEqual(System.Object,System.Object,System.String)";
export const nodeAssertDeepStrictEqualExportName = "deepStrictEqual";
export const nodeAssertDeepStrictEqualSignatureId = "node:assert.deepStrictEqual(System.Object,System.Object,System.String)";
export const nodeAssertThrowsExportName = "throws";
export const nodeAssertThrowsSignatureId = "node:assert.throws(Function,System.String)";
export const nodeAssertMatchExportName = "match";
export const nodeAssertMatchSignatureId = "node:assert.match(System.String,System.Object,System.String)";
export const nodeAssertIfErrorExportName = "ifError";
export const nodeAssertIfErrorSignatureId = "node:assert.ifError(System.Object)";

export function nodeAssertExports(): readonly ProviderExportDeclaration[] {
  return [
    ...nodeAssertUnsupportedTargetIdentities().map((identity) =>
      unsupportedAssertFunction(identity.exportName, identity.signatureId, unsupportedAssertParameters(identity.exportName, identity.signatureId))
    ),
    ...nodeAssertCallTargetMembers().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:assert.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      }],
    })),
  ];
}

export function nodeAssertUnsupportedTargetIdentities(): readonly NodeAssertUnsupportedTargetIdentity[] {
  return nodeAssertUnsupportedCalls.map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
    exportName,
    signatureId,
    targetIdentityId,
    displayName,
  }));
}

export function nodeAssertCallTargetMembers(): readonly NodeAssertCallTargetMember[] {
  return [
    assertCall(nodeAssertOkExportName, nodeAssertOkSignatureId, "Tsonic.CSharp.Node.assert.ok(System.Boolean,System.String)", "ok", [
      boolParameter("value"),
      stringParameter("message", true),
    ], voidProviderType, [
      targetParameter("value", boolTargetType),
      targetParameter("message", stringTargetType, { optional: true }),
    ], voidTargetType),
    assertCall(nodeAssertFailExportName, nodeAssertFailSignatureId, "Tsonic.CSharp.Node.assert.fail(System.String)", "fail", [
      stringParameter("message", true),
    ], voidProviderType, [
      targetParameter("message", stringTargetType, { optional: true }),
    ], voidTargetType),
    assertCall(nodeAssertStrictEqualExportName, nodeAssertStrictEqualSignatureId, "Tsonic.CSharp.Node.assert.strictEqual(System.Object,System.Object,System.String)", "strictEqual", [
      unknownParameter("actual"),
      unknownParameter("expected"),
      stringParameter("message", true),
    ], voidProviderType, [
      targetParameter("actual", objectTargetType),
      targetParameter("expected", objectTargetType),
      targetParameter("message", stringTargetType, { optional: true }),
    ], voidTargetType),
    assertCall(nodeAssertNotStrictEqualExportName, nodeAssertNotStrictEqualSignatureId, "Tsonic.CSharp.Node.assert.notStrictEqual(System.Object,System.Object,System.String)", "notStrictEqual", [
      unknownParameter("actual"),
      unknownParameter("expected"),
      stringParameter("message", true),
    ], voidProviderType, [
      targetParameter("actual", objectTargetType),
      targetParameter("expected", objectTargetType),
      targetParameter("message", stringTargetType, { optional: true }),
    ], voidTargetType),
  ];
}

function unsupportedAssertFunction(
  exportName: string,
  signatureId: string,
  parameters: readonly ProviderParameterDeclaration[],
): ProviderExportDeclaration {
  return {
    id: `node:assert.${exportName}`,
    name: exportName,
    kind: "function",
    signatures: [{
      id: signatureId,
      parameters,
      returnType: voidProviderType,
    }],
  };
}

function unsupportedAssertParameters(
  exportName: string,
  signatureId: string,
): readonly ProviderParameterDeclaration[] {
  const metadata = getNodejsProviderExportSignatureDeclarationMetadata(
    nodeAssertUnsupportedCallByProviderDeclarationIdentity,
    nodeAssertModuleSpecifier,
    exportName,
    signatureId,
  );
  if (metadata === undefined) {
    throw new Error(`Missing C# NodeJS assert unsupported metadata for signature '${signatureId}'.`);
  }
  return metadata.parameters;
}

function boolParameter(name: string, optional = false): ProviderParameterDeclaration {
  return {
    name,
    type: boolProviderType,
    ...(optional ? { optional: true } : {}),
  };
}

function stringParameter(name: string, optional = false): ProviderParameterDeclaration {
  return {
    name,
    type: stringProviderType,
    ...(optional ? { optional: true } : {}),
  };
}

function unknownParameter(name: string, optional = false): ProviderParameterDeclaration {
  return {
    name,
    type: unknownProviderType,
    ...(optional ? { optional: true } : {}),
  };
}

function callbackParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: callbackProviderType,
  };
}

function assertCall(
  sourceName: string,
  signatureId: string,
  targetMemberId: string,
  targetName: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
): NodeAssertCallTargetMember {
  return {
    exportName: sourceName,
    signatureId,
    targetMemberId,
    targetName,
    providerParameters,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: assertTargetType,
      static: true,
    },
  };
}

const equalityAssertParameters = [
  unknownParameter("actual"),
  unknownParameter("expected"),
  stringParameter("message", true),
] satisfies readonly ProviderParameterDeclaration[];

const nodeAssertUnsupportedCalls = [
  {
    exportName: nodeAssertEqualExportName,
    signatureId: nodeAssertEqualSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.assert.equal(System.Object,System.Object,System.String)",
    displayName: "unsupported NodeJS assert.equal",
    parameters: equalityAssertParameters,
  },
  {
    exportName: nodeAssertNotEqualExportName,
    signatureId: nodeAssertNotEqualSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.assert.notEqual(System.Object,System.Object,System.String)",
    displayName: "unsupported NodeJS assert.notEqual",
    parameters: equalityAssertParameters,
  },
  {
    exportName: nodeAssertDeepStrictEqualExportName,
    signatureId: nodeAssertDeepStrictEqualSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.assert.deepStrictEqual(System.Object,System.Object,System.String)",
    displayName: "unsupported NodeJS assert.deepStrictEqual",
    parameters: equalityAssertParameters,
  },
  {
    exportName: nodeAssertThrowsExportName,
    signatureId: nodeAssertThrowsSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.assert.throws(Function,System.String)",
    displayName: "unsupported NodeJS assert.throws",
    parameters: [
      callbackParameter("fn"),
      stringParameter("message", true),
    ],
  },
  {
    exportName: nodeAssertMatchExportName,
    signatureId: nodeAssertMatchSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.assert.match(System.String,System.Object,System.String)",
    displayName: "unsupported NodeJS assert.match",
    parameters: [
      stringParameter("string"),
      unknownParameter("regexp"),
      stringParameter("message", true),
    ],
  },
  {
    exportName: nodeAssertIfErrorExportName,
    signatureId: nodeAssertIfErrorSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.assert.ifError(System.Object)",
    displayName: "unsupported NodeJS assert.ifError",
    parameters: [
      unknownParameter("value"),
    ],
  },
] satisfies readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly parameters: readonly ProviderParameterDeclaration[];
}[];

const nodeAssertUnsupportedCallByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationMetadataIndex(nodeAssertModuleSpecifier, nodeAssertUnsupportedCalls);
