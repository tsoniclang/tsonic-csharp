import type {
  ProviderSymbolIdentity,
} from "@tsonic/tsts";
import {
  csharpNodejsVirtualDeclarationFileName,
} from "../identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "../identity.js";
import {
  canonicalNodejsModuleSpecifier,
  isSupportedNodejsModuleSpecifier,
} from "../module-specifiers.js";

export function isNodejsProviderModule(moduleSpecifier: string | undefined): boolean {
  return isSupportedNodejsModuleSpecifier(moduleSpecifier);
}

export function canonicalNodejsDeclarationIdentity(declaration: NodejsProviderDeclarationIdentity): NodejsProviderDeclarationIdentity {
  const canonicalSpecifier = canonicalNodejsModuleSpecifier(declaration.moduleSpecifier);
  return canonicalSpecifier === undefined
    ? declaration
    : {
        ...declaration,
        providerModuleId: canonicalSpecifier,
        moduleSpecifier: canonicalSpecifier,
        virtualFileName: csharpNodejsVirtualDeclarationFileName(canonicalSpecifier),
      };
}

export function nodejsProviderSymbolIdentityKey(
  symbol: ProviderSymbolIdentity,
): string {
  return [
    symbol.moduleSpecifier,
    symbol.exportName ?? "",
    symbol.memberName ?? "",
    symbol.signatureId ?? "",
  ].join("\u0000");
}

export function nodejsProviderExportSymbolIdentityKey(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string | undefined,
): string {
  return nodejsProviderSymbolIdentityKey({
    moduleSpecifier,
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
  });
}
