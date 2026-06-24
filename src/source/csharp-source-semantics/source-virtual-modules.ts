import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  TargetBindingProvider,
} from "@tsonic/tsts";
import { csharpProviderDiagnostic } from "./diagnostics.js";
import {
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import { csharpSourceSemanticsModules } from "./source-modules.js";
import {
  providerExportDeclarationsForCsharpSourceModule,
} from "./source-virtual-declarations.js";

export function createCsharpSourceVirtualModulesProvider(): TargetBindingProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.source-virtual-modules",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: "Tsonic C# source alias modules",
  };
  return {
    identity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return modules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = modules.get(specifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_SOURCE_MODULE_UNOWNED", 9100001, `C# source alias provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: csharpSourceVirtualDeclarationFileName(specifier),
        providerModuleId: specifier,
        ...(module.packageName !== undefined ? { packageName: module.packageName } : {}),
        ...(module.packageVersion !== undefined ? { packageVersion: module.packageVersion } : {}),
        evidence: [{ message: "C# target supplies source alias module as provider virtual module." }],
      };
    },
    getDeclarationModel(resolution: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const module = modules.get(resolution.moduleSpecifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_SOURCE_MODULE_DECLARATION_MISSING", 9100002, `No C# source alias declaration model exists for '${resolution.moduleSpecifier}'.`);
      }
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: resolution.providerModuleId,
        exports: providerExportDeclarationsForCsharpSourceModule(module),
        evidence: [{ message: "Declaration model is generated from C# source alias semantics." }],
      };
    },
    getTargetIdentity() {
      return undefined;
    },
  };
}

function csharpSourceVirtualDeclarationFileName(specifier: string): string {
  return `tsts-provider://csharp-source/${encodeURIComponent(specifier)}.d.ts`;
}
