import {
  TstsSourceProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
  ProviderIdentity,
  ProviderImportDeclaration,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  SourceDeclarationProvider,
} from "@tsonic/tsts";
import {
  tsonicCoreLangModule,
} from "@tsonic/source-core";
import { csharpProviderDiagnostic } from "./diagnostics.js";
import {
  csharpLangModule,
  csharpProviderVersion,
} from "./identity.js";
import { csharpSourceSemanticsModules } from "./source-modules.js";
import {
  providerExportDeclarationsForCsharpSourceModule,
} from "./source-virtual-declarations.js";

export function createCsharpSourceVirtualModulesProvider(): SourceDeclarationProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.source-virtual-modules",
    version: csharpProviderVersion,
    extensionContractVersion: TstsSourceProviderContractVersion,
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
        ...(resolution.moduleSpecifier === csharpLangModule ? { imports: csharpLangProviderImports() } : {}),
        exports: providerExportDeclarationsForCsharpSourceModule(module),
        evidence: [{ message: "Declaration model is generated from C# source alias semantics." }],
      };
    },
  };
}

function csharpLangProviderImports(): readonly ProviderImportDeclaration[] {
  return [{
    moduleSpecifier: tsonicCoreLangModule,
    typeOnly: true,
    namedImports: [
      {
        exportedName: "__TsonicAttributeBuilder",
        kind: "type",
      },
      {
        exportedName: "__TsonicAttributeMemberBuilder",
        kind: "type",
      },
    ],
  }];
}

function csharpSourceVirtualDeclarationFileName(specifier: string): string {
  return `tsts-provider://csharp-source/${encodeURIComponent(specifier)}.d.ts`;
}
