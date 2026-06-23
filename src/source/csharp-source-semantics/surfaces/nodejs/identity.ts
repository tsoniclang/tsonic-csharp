import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ProviderIdentity,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import {
  csharpProviderVersion,
  csharpTargetId,
} from "../../identity.js";

export const csharpNodejsSurfaceProviderIdentity = {
  id: "tsonic.csharp.nodejs-surface-provider",
  version: csharpProviderVersion,
  target: csharpTargetId,
  extensionContractVersion: TstsProviderContractVersion,
  providerKind: "binding",
  displayName: "Tsonic C# NodeJS surface provider",
} satisfies ProviderIdentity;

export interface NodejsProviderDeclarationIdentity {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly providerModuleId: string;
  readonly moduleSpecifier: string;
  readonly virtualFileName: string;
  readonly exportName?: string;
  readonly memberName?: string;
  readonly memberId?: string;
  readonly signatureId?: string;
}

export function csharpNodejsVirtualDeclarationFileName(specifier: string): string {
  return `tsts-provider://csharp-nodejs/${encodeURIComponent(specifier)}.d.ts`;
}

export function nodejsExportDeclarationIdentity(
  moduleSpecifier: string,
  exportName: string,
): NodejsProviderDeclarationIdentity {
  return {
    providerId: csharpNodejsSurfaceProviderIdentity.id,
    providerVersion: csharpNodejsSurfaceProviderIdentity.version,
    providerModuleId: moduleSpecifier,
    moduleSpecifier,
    virtualFileName: csharpNodejsVirtualDeclarationFileName(moduleSpecifier),
    exportName,
  };
}

export function nodejsExportSignatureDeclarationIdentity(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string,
): NodejsProviderDeclarationIdentity {
  return {
    ...nodejsExportDeclarationIdentity(moduleSpecifier, exportName),
    signatureId,
  };
}

export function nodejsExportMemberDeclarationIdentity(
  moduleSpecifier: string,
  exportName: string,
  memberName: string,
  memberId: string,
): NodejsProviderDeclarationIdentity {
  return {
    ...nodejsExportDeclarationIdentity(moduleSpecifier, exportName),
    memberName,
    memberId,
  };
}

export function nodejsProviderDeclarationIdentityKey(declaration: NodejsProviderDeclarationIdentity): string {
  return [
    declaration.providerId,
    declaration.providerVersion,
    declaration.providerModuleId,
    declaration.moduleSpecifier,
    declaration.virtualFileName,
    declaration.exportName ?? "",
    declaration.memberName ?? "",
    declaration.memberId ?? "",
    declaration.signatureId ?? "",
  ].join("\u0000");
}

export function isCsharpNodejsProviderDeclaration(
  declaration: ProviderVirtualDeclarationFact,
): declaration is ProviderVirtualDeclarationFact & NodejsProviderDeclarationIdentity {
  return declaration.providerId === csharpNodejsSurfaceProviderIdentity.id;
}
