import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderSignatureDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetExportDeclaration,
  DotnetModuleModel,
} from "../model/index.js";
import { tryDotnetTypeRefToProviderType } from "../model/index.js";
import type {
  DotnetDeclarationContext,
  DotnetProviderDeclarationModelOptions,
} from "./context.js";
import { createDotnetDeclarationContext } from "./context.js";
import { providerImportsForExternalRefs, qualifyProviderExportModuleRefs } from "./module-refs.js";
import { dotnetExportToNamespaceMember } from "./namespace-members.js";
import { dotnetSignatureToProviderSignature } from "./signatures.js";
import { dotnetTypeToProviderExport } from "./types.js";
import { normalizeProviderTypeFamilyParameters } from "./type-families.js";

export function dotnetModuleToProviderDeclarationModel(
  module: DotnetModuleModel,
  options: DotnetProviderDeclarationModelOptions = {},
): ProviderDeclarationModel {
  const context = createDotnetDeclarationContext(module, options);
  const exports = module.exports
    .map((declaration) => {
      const providerExport = dotnetExportToProviderExport(declaration, context);
      return providerExport === undefined
        ? undefined
        : qualifyProviderExportModuleRefs(providerExport, context);
    })
    .filter((declaration): declaration is ProviderExportDeclaration => declaration !== undefined);
  const normalizedExports = normalizeProviderTypeFamilyParameters(exports);
  const imports = providerImportsForExternalRefs(normalizedExports, module.moduleSpecifier);
  return {
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: options.providerModuleId ?? module.moduleSpecifier,
    ...(imports.length === 0 ? {} : { imports }),
    exports: normalizedExports,
    evidence: [{ message: ".NET provider declaration model generated from target provider data." }],
  };
}

export function dotnetExportToProviderExport(
  declaration: DotnetExportDeclaration,
  context: DotnetDeclarationContext = createDotnetDeclarationContext({ moduleSpecifier: "", namespaceName: "", exports: [declaration] }),
): ProviderExportDeclaration | undefined {
  switch (declaration.kind) {
    case "type":
      return dotnetTypeToProviderExport(declaration, context);
    case "function": {
      const signatures = declaration.signatures
        .map((signature) => dotnetSignatureToProviderSignature(signature))
        .filter((signature): signature is ProviderSignatureDeclaration => signature !== undefined);
      if (signatures.length === 0) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "function",
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type, `${declaration.targetId}.type`);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "value",
        type,
      };
    }
    case "namespace":
      return {
        id: declaration.namespaceName,
        name: declaration.sourceName,
        kind: "namespace",
        members: declaration.exports
          .map(dotnetExportToNamespaceMember)
          .filter((member): member is ProviderMemberDeclaration => member !== undefined),
      };
  }
}
