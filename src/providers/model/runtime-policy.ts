import type { TargetCapabilityContribution } from "@tsonic/target-api/provider";
import type { ExtensionDiagnostic } from "@tsonic/tsts";
import type { CsharpRuntimeProjectInstance, CsharpRuntimeProjectSource } from "../../target-model/project/runtime.js";
import type { CsharpProviderPolicyContribution } from "../../target-model/metadata/provider-metadata.js";
import type { CsharpNativeDeclaration } from "../../target-model/types/native-declarations.js";
import type { CsharpTargetBindingFact } from "../../target-model/types/model.js";
import type { DotnetModuleModel, DotnetTypeDeclaration } from "../native/model/types.js";

export interface CsharpAcquiredRuntimeNativeDeclaration {
  readonly original: DotnetTypeDeclaration;
  readonly binding: CsharpTargetBindingFact;
  readonly definition: CsharpNativeDeclaration;
}

export interface CsharpRuntimeProviderNativeDomain {
  readonly source: CsharpRuntimeProjectSource;
  readonly namespaces: readonly string[];
}

export interface CsharpAcquiredRuntimeProviderNativeDomain {
  readonly input: CsharpRuntimeProviderNativeDomain;
  readonly selection:
    | { readonly kind: "generated"; readonly project: CsharpRuntimeProjectInstance }
    | { readonly kind: "user-owned"; readonly projectFile: string };
  readonly references: readonly string[];
  readonly modules: readonly DotnetModuleModel[];
  readonly declarations: readonly CsharpAcquiredRuntimeNativeDeclaration[];
}

export type CsharpRuntimeProviderNativeDomainResolution =
  | { readonly kind: "resolved"; readonly domain: CsharpAcquiredRuntimeProviderNativeDomain }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic };

export type CsharpProviderPackagePolicy =
  | { readonly kind: "static"; create(selectedSurfaceIds: readonly string[]): CsharpProviderPolicyContribution }
  | { readonly kind: "runtime-project"; readonly nativeDomain: CsharpRuntimeProviderNativeDomain;
      create(input: { readonly selectedSurfaceIds: readonly string[];
        readonly domain: CsharpAcquiredRuntimeProviderNativeDomain }): CsharpProviderPolicyContribution };

export interface CsharpRuntimeProviderPolicyContribution extends TargetCapabilityContribution {
  readonly kind: "csharp-runtime-provider-policy";
  readonly providerId: string;
  readonly providerVersion: string;
  readonly selectedSurfaceIds: readonly string[];
  readonly policy: Extract<CsharpProviderPackagePolicy, { readonly kind: "runtime-project" }>;
}

export interface CsharpRuntimeProviderNativeAcquisition {
  acquireRuntimeNativeDomain(input: CsharpRuntimeProviderNativeDomain): CsharpRuntimeProviderNativeDomainResolution;
}
