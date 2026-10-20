import type { ProviderDeclarationMaterialization, ProviderDeclarationModel } from "@tsonic/tsts";

import type { DotnetModuleModel, DotnetProviderIdentity } from "./index.js";

export interface DotnetTypeDataProvider {
  readonly identity: DotnetProviderIdentity;
  ownsModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderOwnership;
  getModule(specifier: string, context: DotnetProviderDeclarationContext): DotnetProviderModuleResult;
  recordVirtualDeclarationModel?(model: ProviderDeclarationModel, elapsedMs: number): void;
}

export interface DotnetProviderModuleContext {
  readonly containingFile?: string;
  readonly targetFramework?: string;
  readonly requestedExports?: readonly string[];
  readonly requestedTargetIds?: readonly string[];
  readonly requestedMetadataNames?: readonly string[];
  readonly assemblyName?: string;
  readonly externAlias?: string;
  readonly broadImport?: boolean;
}

export interface DotnetProviderDeclarationContext extends DotnetProviderModuleContext {
  readonly materialization: ProviderDeclarationMaterialization;
}

export const completeDotnetProviderMaterialization = Object.freeze({
  kind: "complete",
} satisfies ProviderDeclarationMaterialization);

export const emptyIncrementalDotnetProviderMaterialization = Object.freeze({
  kind: "incremental",
  completeExports: Object.freeze([]),
} satisfies ProviderDeclarationMaterialization);

export function completeDotnetProviderContext(
  context: DotnetProviderModuleContext = {},
): DotnetProviderDeclarationContext {
  return Object.freeze({
    ...context,
    materialization: completeDotnetProviderMaterialization,
  });
}

export type DotnetProviderOwnership =
  | { readonly kind: "owned" }
  | { readonly kind: "unowned" }
  | { readonly kind: "rejected"; readonly diagnostic: DotnetProviderDiagnostic };

export type DotnetProviderModuleResult = DotnetModuleModel | DotnetProviderDiagnostic;

export interface DotnetProviderDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly evidence?: readonly Readonly<Record<string, unknown>>[];
}
