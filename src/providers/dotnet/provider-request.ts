import type {
  ProviderModuleContext,
} from "@tsonic/tsts";
import type {
  DotnetProviderResolutionContext,
} from "./provider-slices.js";
import {
  dotnetProviderResolutionContext,
} from "./provider-slices.js";
import {
  parseDotnetProviderDependencyModuleSpecifier,
  parseDotnetModuleSpecifier,
} from "./module-specifier.js";

export interface DotnetProviderModuleRequest {
  readonly moduleSpecifier: string;
  readonly requestedExports?: readonly string[];
  readonly internal?: boolean;
}

export function dotnetProviderModuleRequest(
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

export function dotnetProviderModuleContext(
  context: ProviderModuleContext,
  module: DotnetProviderModuleRequest,
): DotnetProviderResolutionContext | undefined {
  if (module.requestedExports === undefined) {
    return dotnetProviderResolutionContext(context);
  }
  return dotnetProviderResolutionContext({ requestedExports: module.requestedExports });
}

export function providerVirtualDeclarationFileName(
  providerId: string,
  specifier: string,
  context: DotnetProviderResolutionContext,
): string {
  const sliceKey = context.broadImport === true
    ? "broad"
    : `slice-${encodeURIComponent(context.requestedExports?.join(",") ?? "")}`;
  return `tsts-provider://${providerId}/${encodeURIComponent(specifier)}/${sliceKey}.d.ts`;
}

function isProviderGeneratedContainingFile(context: ProviderModuleContext | undefined): boolean {
  return context?.containingFile?.startsWith("tsts-provider:") === true;
}
