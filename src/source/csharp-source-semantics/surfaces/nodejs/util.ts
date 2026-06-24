import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "../js/source-library.js";

const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
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
  return [
    unsupportedUtilTargetIdentity(nodeUtilFormatExportName, nodeUtilFormatSignatureId),
    unsupportedUtilTargetIdentity(nodeUtilFormatWithOptionsExportName, nodeUtilFormatWithOptionsSignatureId),
    unsupportedUtilTargetIdentity(nodeUtilInspectExportName, nodeUtilInspectSignatureId),
  ];
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
      returnType: stringProviderType,
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
  switch (exportName) {
    case nodeUtilFormatExportName:
      return [
        unknownParameter("format", true),
        unknownRestParameter("args"),
      ];
    case nodeUtilFormatWithOptionsExportName:
      return [
        unknownParameter("inspectOptions"),
        unknownParameter("formatValue"),
        unknownRestParameter("args"),
      ];
    case nodeUtilInspectExportName:
      return [
        unknownParameter("object"),
      ];
    default:
      return [];
  }
}

function unknownParameter(name: string, optional = false): ProviderParameterDeclaration {
  return {
    name,
    type: unknownProviderType,
    ...(optional ? { optional: true } : {}),
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
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodeUtilCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: targetMethod(
      `Tsonic.CSharp.Node.util.${exportName}(${signatureId.slice("node:util.".length + exportName.length + 1, -1)})`,
      exportName,
      exportName,
      targetParameters,
      targetReturnType,
      {
        declaringType: utilTargetType,
        static: true,
      },
    ),
  };
}
