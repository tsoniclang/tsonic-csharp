import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderSignatureDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetExportDeclaration,
  DotnetModuleModel,
} from "../model.js";
import { tryDotnetTypeRefToProviderType } from "../model.js";
import type {
  DotnetDeclarationContext,
  DotnetProviderDeclarationModelOptions,
} from "./context.js";
import { createDotnetDeclarationContext } from "./context.js";
import { dotnetTargetIdentity } from "./conversions.js";
import { qualifyProviderExportModuleRefs } from "./module-refs.js";
import { dotnetExportToNamespaceMember } from "./namespace-members.js";
import { dotnetSignatureToProviderSignature } from "./signatures.js";
import { dotnetTypeToProviderExport } from "./types.js";

export function dotnetModuleToProviderDeclarationModel(
  module: DotnetModuleModel,
  options: DotnetProviderDeclarationModelOptions = {},
): ProviderDeclarationModel {
  const context = createDotnetDeclarationContext(module, options);
  return {
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: options.providerModuleId ?? module.moduleSpecifier,
    exports: module.exports
      .map((declaration) => {
        const providerExport = dotnetExportToProviderExport(declaration, context);
        return providerExport === undefined
          ? undefined
          : qualifyProviderExportModuleRefs(providerExport, module.moduleSpecifier, context);
      })
      .filter((declaration): declaration is ProviderExportDeclaration => declaration !== undefined),
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
        targetIdentity: dotnetTargetIdentity(declaration.targetId, declaration.sourceName),
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "value",
        targetIdentity: dotnetTargetIdentity(declaration.targetId, declaration.sourceName),
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
