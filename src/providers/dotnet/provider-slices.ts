import type {
  ProviderModuleContext,
} from "@tsonic/tsts";
import type {
  DotnetModuleModel,
} from "./model.js";

export interface DotnetProviderResolutionContext {
  readonly broadImport?: true;
  readonly requestedExports?: readonly string[];
}

export function dotnetProviderResolutionContext(context: ProviderModuleContext | DotnetProviderResolutionContext): DotnetProviderResolutionContext | undefined {
  if (isProviderModuleContext(context)) {
    const slice = context.importSlice;
    if (slice === undefined) {
      return undefined;
    }
    if (slice.broadImport === true || slice.kind === "bare" || slice.kind === "namespace" || slice.kind === "mixed" || slice.kind === "reexport" || slice.kind === "dynamic" || slice.kind === "synthetic" || slice.kind === "unknown") {
      return { broadImport: true };
    }
    const requestedExports = sortedNonEmpty(slice.requestedExports?.map((request) => request.exportedName));
    return requestedExports === undefined ? undefined : { requestedExports };
  }
  if (context.broadImport === true) {
    return { broadImport: true as const };
  }
  const requestedExports = sortedNonEmpty(context.requestedExports);
  return requestedExports === undefined ? undefined : { requestedExports };
}

function isProviderModuleContext(context: ProviderModuleContext | DotnetProviderResolutionContext): context is ProviderModuleContext {
  return "importSlice" in context;
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
