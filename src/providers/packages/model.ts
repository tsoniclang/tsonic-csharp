import type { ExtensionDiagnostic, ExtensionEvidence, ProviderExportDeclaration, ProviderIdentity } from "@tsonic/tsts";
import type { TargetRuntimeContributions } from "@tsonic/target-api/artifacts";
import type { CsharpProviderPackagePolicy } from "../model/runtime-policy.js";

export interface CsharpProviderModuleDefinition {
  readonly moduleSpecifier: string;
  readonly providerModuleId: string;
  getExports(selectedSurfaceIds: readonly string[]): readonly ProviderExportDeclaration[];
}

export interface CsharpProviderModuleSpecifier {
  readonly moduleSpecifier: string;
  readonly canonicalModuleSpecifier: string;
  readonly message?: string;
}

export interface CsharpProviderPackageDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly providerIdentity: ProviderIdentity;
  readonly modules: readonly CsharpProviderModuleDefinition[];
  readonly moduleSpecifiers: readonly CsharpProviderModuleSpecifier[];
  virtualDeclarationFileName(moduleSpecifier: string): string;
  moduleDiagnostic(kind: "unowned" | "missing", moduleSpecifier: string): ExtensionDiagnostic;
  readonly resolutionEvidence?: readonly ExtensionEvidence[];
  readonly declarationEvidence?: readonly ExtensionEvidence[];
  readonly policy: CsharpProviderPackagePolicy;
  readonly runtime: TargetRuntimeContributions;
}
