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
  emptySourceModule,
  providerExportDeclarationsForModule,
} from "./core-virtual-declarations.js";

export function createCsharpCoreVirtualModulesProvider(): TargetBindingProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.core-virtual-modules",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: "Tsonic C# source modules",
  };
  return {
    identity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return modules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = modules.get(specifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_CORE_MODULE_UNOWNED", 9100001, `C# core provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: `tsts-provider://csharp-source/${specifier}`,
        providerModuleId: specifier,
        ...(module.packageName !== undefined ? { packageName: module.packageName } : {}),
        ...(module.packageVersion !== undefined ? { packageVersion: module.packageVersion } : {}),
        evidence: [{ message: "C# target supplies source module as provider virtual module." }],
      };
    },
    getDeclarationModel(resolution: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const module = modules.get(resolution.moduleSpecifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_CORE_MODULE_DECLARATION_MISSING", 9100002, `No C# core declaration model exists for '${resolution.moduleSpecifier}'.`);
      }
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: resolution.providerModuleId,
        exports: providerExportDeclarationsForModule(module),
        evidence: [{ message: "Declaration model is generated from C# target source semantics." }],
      };
    },
    getTargetIdentity(symbol) {
      if (symbol.exportName === undefined) {
        return undefined;
      }
      const declaration = providerExportDeclarationsForModule(modules.get(symbol.moduleSpecifier) ?? emptySourceModule(symbol.moduleSpecifier))
        .find((candidate) => candidate.name === symbol.exportName);
      return declaration?.targetIdentity ?? {
        target: csharpTargetId,
        id: `${symbol.moduleSpecifier}#${symbol.exportName}`,
        displayName: symbol.exportName,
      };
    },
  };
}
