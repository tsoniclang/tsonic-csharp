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
  dotnetModuleSpecifierPolicy,
  parseDotnetModuleSpecifier,
} from "./module-specifier.js";
import type {
  DotnetModuleSpecifierPolicy,
} from "./module-specifier.js";

export interface DotnetProviderModuleRequest {
  readonly moduleSpecifier: string;
  readonly requestedExports?: readonly string[];
  readonly internal?: boolean;
  readonly assemblyName?: string;
  readonly externAlias?: string;
}

export function dotnetProviderModuleRequest(
  specifier: string,
  policy: DotnetModuleSpecifierPolicy = dotnetModuleSpecifierPolicy,
): DotnetProviderModuleRequest | undefined {
  const parsed = parseDotnetModuleSpecifier(specifier, policy);
  return parsed === undefined
    ? undefined
    : {
        moduleSpecifier: specifier,
        ...(parsed.externAlias !== undefined
          ? {
              assemblyName: parsed.externAlias.assemblyName,
              externAlias: parsed.externAlias.alias,
            }
          : {}),
      };
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
): string {
  return `tsts-provider://${providerId}/${encodeURIComponent(specifier)}.d.ts`;
}
