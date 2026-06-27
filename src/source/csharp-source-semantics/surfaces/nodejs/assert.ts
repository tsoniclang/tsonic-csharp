import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
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
import {
  nodejsModuleCallTargetMetadata,
} from "./members/target-member-metadata.js";
import type {
  NodejsModuleCallTargetMetadata,
  NodejsModuleCallTargetMetadataRow,
} from "./members/target-member-metadata.js";

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

export type NodeAssertCallTargetMember = NodejsModuleCallTargetMetadata;
type NodeAssertCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;

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
    assertCall({ exportName: nodeAssertOkExportName, signatureId: nodeAssertOkSignatureId, targetMemberId: "Tsonic.CSharp.Node.assert.ok(System.Boolean,System.String)", sourceName: "ok", targetName: "ok", providerParameters: [
      boolParameter("value"),
      stringParameter("message", true),
    ], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("value", boolTargetType),
      targetParameter("message", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    assertCall({ exportName: nodeAssertFailExportName, signatureId: nodeAssertFailSignatureId, targetMemberId: "Tsonic.CSharp.Node.assert.fail(System.String)", sourceName: "fail", targetName: "fail", providerParameters: [
      stringParameter("message", true),
    ], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("message", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    assertCall({ exportName: nodeAssertStrictEqualExportName, signatureId: nodeAssertStrictEqualSignatureId, targetMemberId: "Tsonic.CSharp.Node.assert.strictEqual(System.Object,System.Object,System.String)", sourceName: "strictEqual", targetName: "strictEqual", providerParameters: [
      unknownParameter("actual"),
      unknownParameter("expected"),
      stringParameter("message", true),
    ], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("actual", objectTargetType),
      targetParameter("expected", objectTargetType),
      targetParameter("message", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    assertCall({ exportName: nodeAssertNotStrictEqualExportName, signatureId: nodeAssertNotStrictEqualSignatureId, targetMemberId: "Tsonic.CSharp.Node.assert.notStrictEqual(System.Object,System.Object,System.String)", sourceName: "notStrictEqual", targetName: "notStrictEqual", providerParameters: [
      unknownParameter("actual"),
      unknownParameter("expected"),
      stringParameter("message", true),
    ], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("actual", objectTargetType),
      targetParameter("expected", objectTargetType),
      targetParameter("message", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
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

function assertCall(row: NodeAssertCallTargetMetadataRow): NodeAssertCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: assertTargetType,
  });
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
