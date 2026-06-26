import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetParameter,
} from "../js/source-library.js";

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

interface NodeUtilCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

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
      unsupportedUtilFunction(identity.exportName, identity.signatureId, unsupportedUtilParameters(identity.exportName))
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
  return nodeUtilUnsupportedCalls.map(({ exportName, signatureId }) =>
    unsupportedUtilTargetIdentity(exportName, signatureId)
  );
}

export function nodeUtilCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  return [
    utilCall(nodeUtilStripVtControlCharactersExportName, nodeUtilStripVtControlCharactersSignatureId, [
      stringParameter("str"),
    ], stringProviderType, [
      targetParameter("input", stringTargetType),
    ], stringTargetType),
    utilCall(nodeUtilToUsvStringExportName, nodeUtilToUsvStringSignatureId, [
      stringParameter("string"),
    ], stringProviderType, [
      targetParameter("input", stringTargetType),
    ], stringTargetType),
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
      returnType: unsupportedUtilReturnType(exportName),
    }],
  };
}

function unsupportedUtilTargetIdentity(
  exportName: string,
  signatureId: string,
): NodeUtilUnsupportedTargetIdentity {
  return {
    exportName,
    signatureId,
    targetIdentityId: `unsupported:Tsonic.CSharp.Node.util.${exportName}(${signatureId.slice("node:util.".length + exportName.length + 1, -1)})`,
    displayName: `unsupported NodeJS util.${exportName}`,
  };
}

function unsupportedUtilParameters(exportName: string): readonly ProviderParameterDeclaration[] {
  return nodeUtilUnsupportedCalls.find((entry) => entry.exportName === exportName)?.parameters ?? [];
}

function unsupportedUtilReturnType(exportName: string): ProviderTypeExpression {
  return nodeUtilUnsupportedCalls.find((entry) => entry.exportName === exportName)?.returnType ?? stringProviderType;
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

function utilCall(
  exportName: string,
  signatureId: string,
  providerParameters: readonly ProviderParameterDeclaration[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
): NodeUtilCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: {
      id: `Tsonic.CSharp.Node.util.${exportName}(${signatureId.slice("node:util.".length + exportName.length + 1, -1)})`,
      sourceName: exportName,
      targetName: exportName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: utilTargetType,
      static: true,
    },
  };
}

const nodeUtilUnsupportedCalls = [
  {
    exportName: nodeUtilFormatExportName,
    signatureId: nodeUtilFormatSignatureId,
    parameters: [
      unknownParameter("format", true),
      unknownRestParameter("args"),
    ],
    returnType: stringProviderType,
  },
  {
    exportName: nodeUtilFormatWithOptionsExportName,
    signatureId: nodeUtilFormatWithOptionsSignatureId,
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
    parameters: [
      unknownParameter("object"),
    ],
    returnType: stringProviderType,
  },
  {
    exportName: nodeUtilDebuglogExportName,
    signatureId: nodeUtilDebuglogSignatureId,
    parameters: [
      stringParameter("section"),
    ],
    returnType: callbackProviderType,
  },
  {
    exportName: nodeUtilDeprecateExportName,
    signatureId: nodeUtilDeprecateSignatureId,
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
    parameters: [
      unknownParameter("val1"),
      unknownParameter("val2"),
    ],
    returnType: boolProviderType,
  },
] satisfies readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly parameters: readonly ProviderParameterDeclaration[];
  readonly returnType: ProviderTypeExpression;
}[];
