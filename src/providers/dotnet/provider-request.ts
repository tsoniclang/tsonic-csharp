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
  parseDotnetModuleSpecifier,
} from "./module-specifier.js";

export interface DotnetProviderModuleRequest {
  readonly moduleSpecifier: string;
  readonly requestedExports?: readonly string[];
  readonly internal?: boolean;
}

export function dotnetProviderModuleRequest(
  specifier: string,
): DotnetProviderModuleRequest | undefined {
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
): string {
  return `tsts-provider://${providerId}/${encodeURIComponent(specifier)}.d.ts`;
}
