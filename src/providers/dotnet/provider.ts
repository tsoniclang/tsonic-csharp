import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderSymbolIdentity,
  TargetBindingProvider,
  TargetIdentity,
} from "@tsonic/tsts";
import { dotnetModuleToProviderDeclarationModel } from "./declaration-model.js";
import type {
  DotnetModuleModel,
  DotnetProviderIdentity,
} from "./model.js";
import {
  dotnetPackageName,
  parseDotnetModuleSpecifier,
} from "./module-specifier.js";

export interface DotnetTypeDataProvider {
  readonly identity: DotnetProviderIdentity;
  ownsModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderOwnership;
  getModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult;
  getTargetIdentity?(symbol: ProviderSymbolIdentity): TargetIdentity | undefined;
}

export interface DotnetProviderModuleContext {
  readonly containingFile?: string;
  readonly targetFramework?: string;
  readonly references?: readonly string[];
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

export interface DotnetBindingProviderOptions {
  readonly provider: DotnetTypeDataProvider;
  readonly targetFramework?: string;
  readonly references?: readonly string[];
}

export function createDotnetTargetBindingProvider(options: DotnetBindingProviderOptions): TargetBindingProvider {
  const identity: ProviderIdentity = {
    id: options.provider.identity.id,
    version: options.provider.identity.version,
    target: "csharp",
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: options.provider.identity.displayName,
  };
  return {
    identity,
    ownsModule(specifier: string, context: ProviderModuleContext): ProviderOwnership {
      const module = parseDotnetModuleSpecifier(specifier);
      if (module === undefined) {
        return { kind: "unowned" };
      }
      return mapDotnetOwnership(options.provider.ownsModule(specifier, providerContext(context, options)));
    },
    resolveModule(specifier: string, context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = parseDotnetModuleSpecifier(specifier);
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${specifier}'.`);
      }
      const ownership = options.provider.ownsModule(specifier, providerContext(context, options));
      if (ownership.kind === "rejected") {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, ownership.diagnostic);
      }
      if (ownership.kind !== "owned") {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_UNOWNED", 9200002, `.NET provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: providerVirtualDeclarationFileName("csharp-dotnet", specifier),
        providerModuleId: specifier,
        packageName: dotnetPackageName,
        evidence: [{ message: ".NET native pass-through provider supplied virtual module." }],
      };
    },
    getDeclarationModel(resolution) {
      const result = options.provider.getModule(resolution.moduleSpecifier, providerContext({}, options));
      if (isDotnetProviderDiagnostic(result)) {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, result);
      }
      return dotnetModuleToProviderDeclarationModel(result);
    },
    getTargetIdentity(symbol) {
      return options.provider.getTargetIdentity?.(symbol);
    },
  };
}

function providerVirtualDeclarationFileName(providerId: string, specifier: string): string {
  return `tsts-provider://${providerId}/${encodeURIComponent(specifier)}.d.ts`;
}

function providerContext(
  context: ProviderModuleContext,
  options: DotnetBindingProviderOptions,
): DotnetProviderModuleContext {
  return {
    ...(context.containingFile !== undefined ? { containingFile: context.containingFile } : {}),
    ...(options.targetFramework !== undefined ? { targetFramework: options.targetFramework } : {}),
    ...(options.references !== undefined ? { references: options.references } : {}),
  };
}

function mapDotnetOwnership(ownership: DotnetProviderOwnership): ProviderOwnership {
  switch (ownership.kind) {
    case "owned":
      return { kind: "owned" };
    case "unowned":
      return { kind: "unowned" };
    case "rejected":
      return {
        kind: "reject",
        diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic("dotnet", ownership.diagnostic),
      };
  }
}

function isDotnetProviderDiagnostic(value: DotnetProviderModuleResult): value is DotnetProviderDiagnostic {
  return "code" in value && "message" in value;
}

function dotnetProviderDiagnosticToExtensionDiagnostic(
  extensionId: string,
  diagnostic: DotnetProviderDiagnostic,
): ExtensionDiagnostic {
  return dotnetExtensionDiagnostic(extensionId, diagnostic.code, 9200000, diagnostic.message, diagnostic.evidence);
}

function dotnetExtensionDiagnostic(
  extensionId: string,
  extensionCode: string,
  numericCode: number,
  message: string,
  evidence?: readonly Readonly<Record<string, unknown>>[],
): ExtensionDiagnostic {
  return {
    extensionId,
    extensionCode,
    numericCode,
    category: "error",
    message,
    ...(evidence !== undefined ? { evidence: evidence.map((details) => ({ message: "Provider evidence", details })) } : {}),
  };
}
