import type { SourceDeclarationProvider } from "@tsonic/tsts";
import { rebaseProviderExport } from "./declarations.js";
import { providerImportsForExports } from "./imports.js";
import type { CsharpProviderPackageDefinition } from "./model.js";

export function createCsharpPackageSourceProvider(
  definition: CsharpProviderPackageDefinition,
  selectedSurfaceIds: readonly string[],
): SourceDeclarationProvider {
  const modules = new Map(definition.modules.map((module) => [module.moduleSpecifier, module]));
  const canonicalBySpecifier = new Map(definition.moduleSpecifiers.map((entry) => [
    entry.moduleSpecifier,
    entry.canonicalModuleSpecifier,
  ]));
  return {
    identity: definition.providerIdentity,
    declarationMaterialization: "complete",
    ownsModule(specifier) {
      return canonicalBySpecifier.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier) {
      const canonicalSpecifier = canonicalBySpecifier.get(specifier);
      const module = canonicalSpecifier === undefined ? undefined : modules.get(canonicalSpecifier);
      if (module === undefined) {
        return definition.moduleDiagnostic("unowned", specifier);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: definition.virtualDeclarationFileName(specifier),
        providerModuleId: module.providerModuleId,
        ...(definition.resolutionEvidence === undefined ? {} : { evidence: definition.resolutionEvidence }),
      };
    },
    getDeclarationModel(resolution) {
      const canonicalSpecifier = canonicalBySpecifier.get(resolution.moduleSpecifier);
      const module = canonicalSpecifier === undefined ? undefined : modules.get(canonicalSpecifier);
      if (module === undefined || module.providerModuleId !== resolution.providerModuleId) {
        return definition.moduleDiagnostic("missing", resolution.moduleSpecifier);
      }
      const exports = module.getExports(selectedSurfaceIds).map((declaration) => rebaseProviderExport(
        declaration,
        module.moduleSpecifier,
        resolution.moduleSpecifier,
      ));
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: module.providerModuleId,
        imports: providerImportsForExports(resolution.moduleSpecifier, exports),
        exports,
        ...(definition.declarationEvidence === undefined ? {} : { evidence: definition.declarationEvidence }),
      };
    },
  };
}
