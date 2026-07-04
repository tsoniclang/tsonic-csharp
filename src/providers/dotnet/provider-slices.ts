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
  const requestedExports = sameModuleProviderRefClosure(module, context.requestedExports);
  return {
    ...module,
    exports: module.exports.filter((declaration) => requestedExports.has(declaration.sourceName)),
  };
}

function sameModuleProviderRefClosure(
  module: DotnetModuleModel,
  requestedExports: readonly string[],
): ReadonlySet<string> {
  const included = new Set(requestedExports);
  const pending = [...included];
  const exportsByName = new Map(module.exports.map((declaration) => [declaration.sourceName, declaration]));
  while (pending.length > 0) {
    const exportName = pending.pop();
    const declaration = exportName === undefined ? undefined : exportsByName.get(exportName);
    if (declaration === undefined) {
      continue;
    }
    for (const dependency of sameModuleProviderRefs(declaration, module.moduleSpecifier)) {
      if (included.has(dependency)) {
        continue;
      }
      included.add(dependency);
      pending.push(dependency);
    }
  }
  return included;
}

function sameModuleProviderRefs(value: unknown, moduleSpecifier: string): readonly string[] {
  const refs = new Set<string>();
  collectSameModuleProviderRefs(value, moduleSpecifier, refs, new WeakSet<object>());
  return [...refs].sort();
}

function collectSameModuleProviderRefs(
  value: unknown,
  moduleSpecifier: string,
  refs: Set<string>,
  visited: WeakSet<object>,
): void {
  if (value === undefined || value === null || typeof value !== "object") {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSameModuleProviderRefs(item, moduleSpecifier, refs, visited);
    }
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.kind === "provider-ref" && record.moduleSpecifier === moduleSpecifier && typeof record.exportName === "string") {
    refs.add(record.exportName);
  }
  for (const child of Object.values(record)) {
    collectSameModuleProviderRefs(child, moduleSpecifier, refs, visited);
  }
}

function sortedNonEmpty(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  return [...new Set(values)].sort();
}
