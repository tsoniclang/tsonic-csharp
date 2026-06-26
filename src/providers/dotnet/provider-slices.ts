import type {
  ProviderModuleContext,
} from "@tsonic/tsts";
import type {
  DotnetModuleModel,
} from "./model.js";

export type DotnetProviderResolutionContext = Pick<ProviderModuleContext, "broadImport" | "requestedExports">;

export function dotnetProviderResolutionContext(context: DotnetProviderResolutionContext): DotnetProviderResolutionContext | undefined {
  if (context.broadImport === true) {
    return { broadImport: true as const };
  }
  const requestedExports = sortedNonEmpty(context.requestedExports);
  return requestedExports === undefined ? undefined : { requestedExports };
}

export function missingDotnetRequestedExports(
  module: DotnetModuleModel,
  context: DotnetProviderResolutionContext,
): readonly string[] {
  if (context.broadImport === true || context.requestedExports === undefined) {
    return [];
  }
  const exportedNames = new Set(module.exports.map((declaration) => declaration.sourceName));
  return context.requestedExports.filter((exportName) => !exportedNames.has(exportName));
}

export function sliceDotnetModuleExports(
  module: DotnetModuleModel,
  context: DotnetProviderResolutionContext,
): DotnetModuleModel {
  if (context.broadImport === true || context.requestedExports === undefined) {
    return module;
  }
  const requestedExports = new Set(context.requestedExports);
  return {
    ...module,
    exports: module.exports.filter((declaration) => requestedExports.has(declaration.sourceName)),
  };
}

function sortedNonEmpty(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  return [...new Set(values)].sort();
}
