import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
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

const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const callbackProviderType = {
  kind: "function",
  parameters: [{ name: "args", type: { kind: "array", elementType: unknownProviderType }, rest: true }],
  returnType: voidProviderType,
} satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const utilTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.util", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "util"));

type NodeUtilCallTargetMember = NodejsModuleCallTargetMetadata;
type NodeUtilCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;

export interface NodeUtilUnsupportedTargetIdentity {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
}

export const nodeUtilModuleSpecifier = "node:util";
export const nodeUtilFormatExportName = "format";
export const nodeUtilFormatSignatureId = "node:util.format(System.Object,System.Object[])";
export const nodeUtilFormatWithOptionsExportName = "formatWithOptions";
export const nodeUtilFormatWithOptionsSignatureId = "node:util.formatWithOptions(System.Object,System.Object,System.Object[])";
export const nodeUtilInspectExportName = "inspect";
export const nodeUtilInspectSignatureId = "node:util.inspect(System.Object)";
export const nodeUtilDebuglogExportName = "debuglog";
export const nodeUtilDebuglogSignatureId = "node:util.debuglog(System.String)";
export const nodeUtilDeprecateExportName = "deprecate";
export const nodeUtilDeprecateSignatureId = "node:util.deprecate(Function,System.String,System.String)";
export const nodeUtilIsDeepStrictEqualExportName = "isDeepStrictEqual";
export const nodeUtilIsDeepStrictEqualSignatureId = "node:util.isDeepStrictEqual(System.Object,System.Object)";
export const nodeUtilStripVtControlCharactersExportName = "stripVTControlCharacters";
export const nodeUtilStripVtControlCharactersSignatureId = "node:util.stripVTControlCharacters(System.String)";
export const nodeUtilToUsvStringExportName = "toUSVString";
export const nodeUtilToUsvStringSignatureId = "node:util.toUSVString(System.String)";

export function nodeUtilExports(): readonly ProviderExportDeclaration[] {
  return [
    ...nodeUtilUnsupportedTargetIdentities().map((identity) =>
      unsupportedUtilFunction(identity.exportName, identity.signatureId, unsupportedUtilParameters(identity.exportName, identity.signatureId))
    ),
    ...nodeUtilCallTargetMembers().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:util.${exportName}`,
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

export function nodeUtilUnsupportedTargetIdentities(): readonly NodeUtilUnsupportedTargetIdentity[] {
  return nodeUtilUnsupportedCalls.map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
    exportName,
    signatureId,
    targetIdentityId,
    displayName,
  }));
}

export function nodeUtilCallTargetMembers(): readonly NodeUtilCallTargetMember[] {
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  return [
    utilCall({ exportName: nodeUtilStripVtControlCharactersExportName, signatureId: nodeUtilStripVtControlCharactersSignatureId, targetMemberId: "Tsonic.CSharp.Node.util.stripVTControlCharacters(System.String)", sourceName: "stripVTControlCharacters", targetName: "stripVTControlCharacters", providerParameters: [
      stringParameter("str"),
    ], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
    ], targetReturnType: stringTargetType }),
    utilCall({ exportName: nodeUtilToUsvStringExportName, signatureId: nodeUtilToUsvStringSignatureId, targetMemberId: "Tsonic.CSharp.Node.util.toUSVString(System.String)", sourceName: "toUSVString", targetName: "toUSVString", providerParameters: [
      stringParameter("string"),
    ], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("input", stringTargetType),
    ], targetReturnType: stringTargetType }),
  ];
}

function unsupportedUtilFunction(
  exportName: string,
  signatureId: string,
  parameters: readonly ProviderParameterDeclaration[],
): ProviderExportDeclaration {
  return {
    id: `node:util.${exportName}`,
    name: exportName,
    kind: "function",
    signatures: [{
      id: signatureId,
      parameters,
      returnType: unsupportedUtilReturnType(exportName, signatureId),
    }],
  };
}

function unsupportedUtilParameters(
  exportName: string,
  signatureId: string,
): readonly ProviderParameterDeclaration[] {
  return unsupportedUtilMetadata(exportName, signatureId).parameters;
}

function unsupportedUtilReturnType(
  exportName: string,
  signatureId: string,
): ProviderTypeExpression {
  return unsupportedUtilMetadata(exportName, signatureId).returnType;
}

function unsupportedUtilMetadata(
  exportName: string,
  signatureId: string,
): typeof nodeUtilUnsupportedCalls[number] {
  const metadata = getNodejsProviderExportSignatureDeclarationMetadata(
    nodeUtilUnsupportedCallByProviderDeclarationIdentity,
    nodeUtilModuleSpecifier,
    exportName,
    signatureId,
  );
  if (metadata === undefined) {
    throw new Error(`Missing C# NodeJS util unsupported metadata for signature '${signatureId}'.`);
  }
  return metadata;
}

function unknownParameter(name: string, optional = false): ProviderParameterDeclaration {
  return {
    name,
    type: unknownProviderType,
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

function callbackParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: callbackProviderType,
  };
}

function unknownRestParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: { kind: "array", elementType: unknownProviderType },
    rest: true,
  };
}

function utilCall(row: NodeUtilCallTargetMetadataRow): NodeUtilCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: utilTargetType,
  });
}

const nodeUtilUnsupportedCalls = [
  {
    exportName: nodeUtilFormatExportName,
    signatureId: nodeUtilFormatSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.util.format(System.Object,System.Object[])",
    displayName: "unsupported NodeJS util.format",
    parameters: [
      unknownParameter("format", true),
      unknownRestParameter("args"),
    ],
    returnType: stringProviderType,
  },
  {
    exportName: nodeUtilFormatWithOptionsExportName,
    signatureId: nodeUtilFormatWithOptionsSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.util.formatWithOptions(System.Object,System.Object,System.Object[])",
    displayName: "unsupported NodeJS util.formatWithOptions",
    parameters: [
      unknownParameter("inspectOptions"),
      unknownParameter("formatValue"),
      unknownRestParameter("args"),
    ],
    returnType: stringProviderType,
  },
  {
    exportName: nodeUtilInspectExportName,
    signatureId: nodeUtilInspectSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.util.inspect(System.Object)",
    displayName: "unsupported NodeJS util.inspect",
    parameters: [
      unknownParameter("object"),
    ],
    returnType: stringProviderType,
  },
  {
    exportName: nodeUtilDebuglogExportName,
    signatureId: nodeUtilDebuglogSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.util.debuglog(System.String)",
    displayName: "unsupported NodeJS util.debuglog",
    parameters: [
      stringParameter("section"),
    ],
    returnType: callbackProviderType,
  },
  {
    exportName: nodeUtilDeprecateExportName,
    signatureId: nodeUtilDeprecateSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.util.deprecate(Function,System.String,System.String)",
    displayName: "unsupported NodeJS util.deprecate",
    parameters: [
      callbackParameter("fn"),
      stringParameter("msg"),
      stringParameter("code", true),
    ],
    returnType: callbackProviderType,
  },
  {
    exportName: nodeUtilIsDeepStrictEqualExportName,
    signatureId: nodeUtilIsDeepStrictEqualSignatureId,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.util.isDeepStrictEqual(System.Object,System.Object)",
    displayName: "unsupported NodeJS util.isDeepStrictEqual",
    parameters: [
      unknownParameter("val1"),
      unknownParameter("val2"),
    ],
    returnType: boolProviderType,
  },
] satisfies readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly parameters: readonly ProviderParameterDeclaration[];
  readonly returnType: ProviderTypeExpression;
}[];

const nodeUtilUnsupportedCallByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationMetadataIndex(nodeUtilModuleSpecifier, nodeUtilUnsupportedCalls);
