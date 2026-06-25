import {
  performance,
} from "node:perf_hooks";
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
  augmentDotnetModuleWithNativeArray,
} from "./native-array.js";
import {
  createDotnetProviderDependencyModuleSpecifier,
  dotnetPackageName,
  parseDotnetProviderDependencyModuleSpecifier,
  parseDotnetModuleSpecifier,
} from "./module-specifier.js";

export interface DotnetTypeDataProvider {
  readonly identity: DotnetProviderIdentity;
  ownsModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderOwnership;
  getModule(specifier: string, context: DotnetProviderModuleContext): DotnetProviderModuleResult;
  getTargetIdentity?(symbol: ProviderSymbolIdentity): TargetIdentity | undefined;
  recordVirtualDeclarationModel?(model: ProviderDeclarationModel, elapsedMs: number): void;
}

export interface DotnetProviderModuleContext {
  readonly containingFile?: string;
  readonly targetFramework?: string;
  readonly references?: readonly string[];
  readonly requestedExports?: readonly string[];
  readonly broadImport?: boolean;
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
      const module = dotnetProviderModuleRequest(specifier, identity.id, context);
      if (module === undefined) {
        return { kind: "unowned" };
      }
      return mapDotnetOwnership(identity.id, options.provider.ownsModule(module.moduleSpecifier, providerContext(dotnetProviderModuleContext(context, module), options)));
    },
    resolveModule(specifier: string, context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = dotnetProviderModuleRequest(specifier, identity.id, context);
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${specifier}'.`);
      }
      const moduleContext = dotnetProviderModuleContext(context, module);
      const ownership = options.provider.ownsModule(module.moduleSpecifier, providerContext(moduleContext, options));
      if (ownership.kind === "rejected") {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, ownership.diagnostic);
      }
      if (ownership.kind !== "owned") {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_UNOWNED", 9200002, `.NET provider does not own '${specifier}'.`);
      }
      const resolutionContext = dotnetProviderResolutionContext(moduleContext);
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: providerVirtualDeclarationFileName(identity.id, specifier, resolutionContext),
        providerModuleId: module.moduleSpecifier,
        ...(module.internal === true ? {} : { packageName: dotnetPackageName }),
        ...(resolutionContext.broadImport === true ? { broadImport: true as const } : {}),
        ...(resolutionContext.requestedExports !== undefined ? { requestedExports: resolutionContext.requestedExports } : {}),
        evidence: [{ message: ".NET native pass-through provider supplied virtual module." }],
      };
    },
    getDeclarationModel(resolution) {
      const module = dotnetProviderModuleRequest(resolution.moduleSpecifier, identity.id, {
        containingFile: resolution.virtualFileName,
      });
      if (module === undefined) {
        return dotnetExtensionDiagnostic(identity.id, "DOTNET_MODULE_SPECIFIER_INVALID", 9200001, `.NET provider does not own '${resolution.moduleSpecifier}'.`);
      }
      const result = options.provider.getModule(module.moduleSpecifier, providerContext({
        ...(resolution.broadImport === true ? { broadImport: true as const } : {}),
        ...(resolution.requestedExports !== undefined ? { requestedExports: resolution.requestedExports } : {}),
      }, options));
      if (isDotnetProviderDiagnostic(result)) {
        return dotnetProviderDiagnosticToExtensionDiagnostic(identity.id, result);
      }
      const startedAt = performance.now();
      const resolvedModule = {
        ...augmentDotnetModuleWithNativeArray(result),
        moduleSpecifier: resolution.moduleSpecifier,
      };
      const model = dotnetModuleToProviderDeclarationModel(resolvedModule, {
        dependencyModuleSpecifier(moduleSpecifier, sourceName) {
          return createDotnetProviderDependencyModuleSpecifier(identity.id, moduleSpecifier, [sourceName]);
        },
        resolveModule(specifier) {
          const resolved = options.provider.getModule(specifier, providerContext({}, options));
          return isDotnetProviderDiagnostic(resolved) ? undefined : augmentDotnetModuleWithNativeArray(resolved);
        },
      });
      options.provider.recordVirtualDeclarationModel?.(model, performance.now() - startedAt);
      return model;
    },
    getTargetIdentity(symbol) {
      return options.provider.getTargetIdentity?.(symbol);
    },
  };
}

interface DotnetProviderModuleRequest {
  readonly moduleSpecifier: string;
  readonly requestedExports?: readonly string[];
  readonly internal?: boolean;
}

function dotnetProviderModuleRequest(
  specifier: string,
  providerId: string,
  context?: ProviderModuleContext,
): DotnetProviderModuleRequest | undefined {
  const dependency = parseDotnetProviderDependencyModuleSpecifier(specifier);
  if (dependency !== undefined) {
    return dependency.providerId === providerId && isProviderGeneratedContainingFile(context)
      ? {
          moduleSpecifier: dependency.moduleSpecifier,
          requestedExports: dependency.requestedExports,
          internal: true,
        }
      : undefined;
  }
  return parseDotnetModuleSpecifier(specifier) === undefined
    ? undefined
    : { moduleSpecifier: specifier };
}

function isProviderGeneratedContainingFile(context: ProviderModuleContext | undefined): boolean {
  return context?.containingFile?.startsWith("tsts-provider:") === true;
}

function dotnetProviderModuleContext(
  context: ProviderModuleContext,
  module: DotnetProviderModuleRequest,
): ProviderModuleContext {
  if (module.requestedExports === undefined) {
    return context;
  }
  return {
    ...context,
    requestedExports: module.requestedExports,
    broadImport: false,
  };
}

function dotnetProviderResolutionContext(context: ProviderModuleContext): Pick<ProviderModuleContext, "broadImport" | "requestedExports"> {
  if (context.broadImport === true || context.requestedExports === undefined || context.requestedExports.length === 0) {
    return { broadImport: true as const };
  }
  return { requestedExports: [...context.requestedExports].sort() };
}

function providerVirtualDeclarationFileName(
  providerId: string,
  specifier: string,
  context: Pick<ProviderModuleContext, "broadImport" | "requestedExports">,
): string {
  const sliceKey = context.broadImport === true
    ? "broad"
    : `slice-${encodeURIComponent(context.requestedExports?.join(",") ?? "")}`;
  return `tsts-provider://${providerId}/${encodeURIComponent(specifier)}/${sliceKey}.d.ts`;
}

function providerContext(
  context: ProviderModuleContext,
  options: DotnetBindingProviderOptions,
): DotnetProviderModuleContext {
  return {
    ...(context.containingFile !== undefined ? { containingFile: context.containingFile } : {}),
    ...(context.broadImport === true ? { broadImport: true as const } : {}),
    ...(context.requestedExports !== undefined ? { requestedExports: context.requestedExports } : {}),
    ...(options.targetFramework !== undefined ? { targetFramework: options.targetFramework } : {}),
    ...(options.references !== undefined ? { references: options.references } : {}),
  };
}

function mapDotnetOwnership(extensionId: string, ownership: DotnetProviderOwnership): ProviderOwnership {
  switch (ownership.kind) {
    case "owned":
      return { kind: "owned" };
    case "unowned":
      return { kind: "unowned" };
    case "rejected":
      return {
        kind: "reject",
        diagnostic: dotnetProviderDiagnosticToExtensionDiagnostic(extensionId, ownership.diagnostic),
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
