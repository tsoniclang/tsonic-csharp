import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderSignatureDeclaration,
  ProviderSymbolIdentity,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  nodejsExportMemberDeclarationIdentity,
  nodejsExportMemberSignatureDeclarationIdentity,
} from "./identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";

export interface NodejsDefaultModuleObjectMetadata {
  readonly moduleSpecifier: string;
  readonly interfaceName: string;
  readonly valueName: string;
}

export const nodejsDefaultModuleObjects = [
  { moduleSpecifier: "node:assert", interfaceName: "NodeAssertModule", valueName: "assert" },
  { moduleSpecifier: "node:buffer", interfaceName: "NodeBufferModule", valueName: "buffer" },
  { moduleSpecifier: "node:crypto", interfaceName: "NodeCryptoModule", valueName: "crypto" },
  { moduleSpecifier: "node:fs", interfaceName: "NodeFsModule", valueName: "fs" },
  { moduleSpecifier: "node:fs/promises", interfaceName: "NodeFsPromisesModule", valueName: "fsPromises" },
  { moduleSpecifier: "node:os", interfaceName: "NodeOsModule", valueName: "os" },
  { moduleSpecifier: "node:path", interfaceName: "NodePathModule", valueName: "path" },
  { moduleSpecifier: "node:process", interfaceName: "NodeProcessModule", valueName: "process" },
  { moduleSpecifier: "node:url", interfaceName: "NodeUrlModule", valueName: "url" },
  { moduleSpecifier: "node:util", interfaceName: "NodeUtilModule", valueName: "util" },
] satisfies readonly NodejsDefaultModuleObjectMetadata[];

export function nodejsDefaultModuleObjectExports(
  moduleSpecifier: string,
  exports: readonly ProviderExportDeclaration[],
): readonly ProviderExportDeclaration[] {
  const metadata = nodejsDefaultModuleObjectMetadata(moduleSpecifier);
  if (metadata === undefined) {
    return [];
  }
  const members = exports.flatMap((declaration) =>
    nodejsDefaultModuleObjectMembersForDeclaration(moduleSpecifier, declaration)
  );
  return members.length === 0
    ? []
    : [
        {
          id: nodejsDefaultModuleInterfaceId(moduleSpecifier, metadata.interfaceName),
          name: metadata.interfaceName,
          kind: "interface" as const,
          members,
        },
        {
          id: nodejsDefaultModuleValueId(moduleSpecifier),
          name: metadata.valueName,
          exportKind: "default" as const,
          kind: "value" as const,
          type: {
            kind: "provider-ref",
            moduleSpecifier,
            exportName: metadata.interfaceName,
          } satisfies ProviderTypeExpression,
        },
      ];
}

export function nodejsDefaultModuleObjectMetadata(
  moduleSpecifier: string,
): NodejsDefaultModuleObjectMetadata | undefined {
  return nodejsDefaultModuleObjects.find((metadata) => metadata.moduleSpecifier === moduleSpecifier);
}

export function nodejsDefaultModuleMemberDeclarationIdentities(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string | undefined,
): readonly NodejsProviderDeclarationIdentity[] {
  const metadata = nodejsDefaultModuleObjectMetadata(moduleSpecifier);
  if (metadata === undefined) {
    return [];
  }
  const memberId = nodejsDefaultModuleMemberId(moduleSpecifier, metadata.interfaceName, exportName);
  return signatureId === undefined
    ? [nodejsExportMemberDeclarationIdentity(moduleSpecifier, metadata.interfaceName, exportName, memberId)]
    : [
        nodejsExportMemberDeclarationIdentity(moduleSpecifier, metadata.interfaceName, exportName, memberId),
        nodejsExportMemberSignatureDeclarationIdentity(moduleSpecifier, metadata.interfaceName, exportName, memberId, signatureId),
      ];
}

export function nodejsDefaultModuleMemberSymbolIdentities(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string | undefined,
): readonly ProviderSymbolIdentity[] {
  const metadata = nodejsDefaultModuleObjectMetadata(moduleSpecifier);
  if (metadata === undefined) {
    return [];
  }
  return [
    {
      moduleSpecifier,
      exportName: metadata.interfaceName,
      memberName: exportName,
      ...(signatureId !== undefined ? { signatureId } : {}),
    },
  ];
}

function nodejsDefaultModuleObjectMembersForDeclaration(
  moduleSpecifier: string,
  declaration: ProviderExportDeclaration,
): readonly ProviderMemberDeclaration[] {
  const exportName = providerExportName(declaration);
  if (exportName === "default") {
    return [];
  }
  switch (declaration.kind) {
    case "function":
      return [{
        id: nodejsDefaultModuleMemberIdForDeclaration(moduleSpecifier, declaration),
        name: exportName,
        kind: "method",
        signatures: declaration.signatures?.map((signature) => nodejsDefaultModuleSignature(signature)) ?? [],
      }];
    case "value":
      return declaration.type === undefined
        ? []
        : [{
            id: nodejsDefaultModuleMemberIdForDeclaration(moduleSpecifier, declaration),
            name: exportName,
            kind: "property",
            readonly: true,
            type: declaration.type,
          }];
    default:
      return [];
  }
}

function nodejsDefaultModuleSignature(signature: ProviderSignatureDeclaration): ProviderSignatureDeclaration {
  return {
    id: signature.id,
    ...(signature.name !== undefined ? { name: signature.name } : {}),
    parameters: signature.parameters,
    ...(signature.returnType !== undefined ? { returnType: signature.returnType } : {}),
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters } : {}),
    ...(signature.documentation !== undefined ? { documentation: signature.documentation } : {}),
  };
}

function providerExportName(declaration: ProviderExportDeclaration): string {
  return declaration.exportKind === "default" ? "default" : declaration.exportName ?? declaration.name;
}

function nodejsDefaultModuleMemberIdForDeclaration(
  moduleSpecifier: string,
  declaration: ProviderExportDeclaration,
): string {
  const metadata = nodejsDefaultModuleObjectMetadata(moduleSpecifier);
  if (metadata === undefined) {
    throw new Error(`Missing C# NodeJS default module object metadata for '${moduleSpecifier}'.`);
  }
  return nodejsDefaultModuleMemberId(moduleSpecifier, metadata.interfaceName, providerExportName(declaration));
}

function nodejsDefaultModuleInterfaceId(moduleSpecifier: string, interfaceName: string): string {
  return `${moduleSpecifier}.${interfaceName}`;
}

function nodejsDefaultModuleValueId(moduleSpecifier: string): string {
  return `${moduleSpecifier}.default`;
}

function nodejsDefaultModuleMemberId(
  moduleSpecifier: string,
  interfaceName: string,
  exportName: string,
): string {
  return `${moduleSpecifier}.${interfaceName}.${exportName}`;
}
