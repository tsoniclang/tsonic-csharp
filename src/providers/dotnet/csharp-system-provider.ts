import type {
  DotnetProviderIdentity,
} from "./model.js";
import type {
  DotnetProviderModuleContext,
  DotnetProviderModuleResult,
  DotnetProviderOwnership,
  DotnetTypeDataProvider,
} from "./provider.js";
import { dotnetModuleToProviderDeclarationModel } from "./declaration-model.js";
import { dotnetExportToTargetBinding } from "./model.js";
import { dotnetProviderDiagnostic } from "./csharp-system-provider-builders.js";
import {
  csharpSystemModules,
  getCsharpSystemModule,
  hasCsharpSystemModule,
} from "./csharp-system-modules.js";
import type { ProviderExportDeclaration } from "@tsonic/tsts";
import type { TargetBindingFact } from "@tsonic/tsts";

const providerIdentity: DotnetProviderIdentity = {
  id: "tsonic.csharp.dotnet-system-provider",
  version: "0.0.1",
  target: "csharp",
  displayName: "Tsonic C# .NET system provider",
};

export function createCsharpDotnetSystemTypeDataProvider(): DotnetTypeDataProvider {
  return {
    identity: providerIdentity,
    ownsModule(specifier: string, _context: DotnetProviderModuleContext): DotnetProviderOwnership {
      return hasCsharpSystemModule(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    getModule(specifier: string, _context: DotnetProviderModuleContext): DotnetProviderModuleResult {
      return getCsharpSystemModule(specifier) ?? dotnetProviderDiagnostic(
        "DOTNET_SYSTEM_MODULE_MISSING",
        `.NET system provider has no module model for '${specifier}'.`,
        { specifier },
      );
    },
  };
}

export function findCsharpDotnetProviderExportByTargetId(targetId: string): ProviderExportDeclaration | undefined {
  for (const module of csharpSystemModules) {
    const model = dotnetModuleToProviderDeclarationModel(module);
    const declaration = model.exports.find((candidate) =>
      candidate.targetIdentity?.target === "csharp" &&
      candidate.targetIdentity.id === targetId
    );
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

export function findCsharpDotnetTargetBindingByTargetId(targetId: string): TargetBindingFact | undefined {
  for (const module of csharpSystemModules) {
    for (const declaration of module.exports) {
      if (declaration.kind === "type" && declaration.metadataName === targetId) {
        return dotnetExportToTargetBinding(declaration);
      }
    }
  }
  return undefined;
}
