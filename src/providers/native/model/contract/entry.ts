import { createContractCollector, requireNonEmptyString, requireUnique } from "./support.js";
import { validateExportList } from "./dotnet-declarations.js";
import { validateOptionalDotnetAssemblyReference } from "./dotnet-identities.js";
import { validateProviderExportDeclaration } from "./provider-declarations.js";
import { validateUnsupportedExports } from "./dotnet-signatures.js";
import type { DotnetModuleModel } from "../index.js";
import type { DotnetProviderDiagnostic } from "../../provider.js";
import type { ProviderDeclarationModel } from "@tsonic/tsts";

export function validateDotnetModuleModelContract(module: DotnetModuleModel): DotnetProviderDiagnostic | undefined {
  const collector = createContractCollector("DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "Invalid .NET provider model contract.");
  requireNonEmptyString(module.moduleSpecifier, "$.moduleSpecifier", collector);
  requireNonEmptyString(module.namespaceName, "$.namespaceName", collector);
  validateOptionalDotnetAssemblyReference(module.assembly, "$.assembly", collector);
  validateExportList(module.exports, "$.exports", collector, { sourceVisible: true });
  validateExportList(module.targetOnlyTypes ?? [], "$.targetOnlyTypes", collector, { sourceVisible: false });
  validateUnsupportedExports(module.unsupportedExports ?? [], "$.unsupportedExports", collector);
  return collector.diagnostic();
}
export function validateDotnetProviderDeclarationModelContract(model: ProviderDeclarationModel): DotnetProviderDiagnostic | undefined {
  const collector = createContractCollector("DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID", "Invalid .NET provider declaration contract.");
  requireNonEmptyString(model.moduleSpecifier, "$.moduleSpecifier", collector);
  requireNonEmptyString(model.providerModuleId, "$.providerModuleId", collector);
  const exportIds = new Set<string>();
  const exportNames = new Set<string>();
  for (const [index, declaration] of model.exports.entries()) {
    const path = `$.exports[${index}]`;
    requireNonEmptyString(declaration.id, `${path}.id`, collector);
    requireNonEmptyString(declaration.name, `${path}.name`, collector);
    requireUnique(exportIds, declaration.id, `${path}.id`, collector);
    requireUnique(exportNames, declaration.exportName ?? declaration.name, `${path}.exportName`, collector);
    validateProviderExportDeclaration(declaration, path, collector);
  }
  return collector.diagnostic();
}
