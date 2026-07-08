import type {
  ProviderModuleContext,
} from "@tsonic/tsts";
import type {
  DotnetModuleModel,
  DotnetExportDeclaration,
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
  const exportedNames = new Set(module.exports.flatMap(dotnetSourceExportNames));
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
    exports: module.exports.filter((declaration) => dotnetSourceExportNames(declaration).some((exportName) => requestedExports.has(exportName))),
  };
}

export function missingDotnetSameModuleProviderRefExports(
  module: DotnetModuleModel,
  requestedExports: readonly string[] | undefined,
): readonly string[] {
  if (requestedExports === undefined) {
    return [];
  }
  const exportedNames = new Set(module.exports.flatMap(dotnetSourceExportNames));
  return [...sameModuleProviderRefClosure(module, requestedExports)]
    .filter((exportName) => !exportedNames.has(exportName));
}

function sameModuleProviderRefClosure(
  module: DotnetModuleModel,
  requestedExports: readonly string[],
): ReadonlySet<string> {
  const included = new Set(requestedExports);
  const pending = [...included];
  const expanded = new Set<string>();
  const exportsByName = new Map<string, DotnetExportDeclaration[]>();
  for (const declaration of module.exports) {
    for (const exportName of dotnetSourceExportNames(declaration)) {
      const declarations = exportsByName.get(exportName) ?? [];
      declarations.push(declaration);
      exportsByName.set(exportName, declarations);
    }
  }
  while (pending.length > 0) {
    const exportName = pending.pop();
    if (exportName === undefined || expanded.has(exportName)) {
      continue;
    }
    expanded.add(exportName);
    const declarations = exportsByName.get(exportName);
    if (declarations === undefined) {
      continue;
    }
    for (const declaration of declarations) {
      if (!requestedExports.includes(exportName) && !dotnetDeclarationExpandsSourceClosure(declaration)) {
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
  }
  return included;
}

function dotnetDeclarationExpandsSourceClosure(declaration: DotnetExportDeclaration): boolean {
  switch (declaration.kind) {
    case "type":
      return (declaration.members?.length ?? 0) > 0 ||
        (declaration.conversionOperators?.length ?? 0) > 0 ||
        declaration.baseType !== undefined ||
        (declaration.implementedContracts?.length ?? 0) > 0;
    case "function":
      return declaration.signatures.length > 0;
    case "value":
      return true;
    case "namespace":
      return declaration.exports.length > 0;
  }
}

function dotnetSourceExportNames(declaration: DotnetExportDeclaration): readonly string[] {
  if (declaration.kind === "type" && declaration.sourceTypeFamily !== undefined) {
    return declaration.sourceName === declaration.sourceTypeFamily.exportName
      ? [declaration.sourceName]
      : [declaration.sourceName, declaration.sourceTypeFamily.exportName];
  }
  return [declaration.sourceName];
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
  for (const [key, child] of Object.entries(record)) {
    if (nonSourceClosureMetadataKeys.has(key)) {
      continue;
    }
    collectSameModuleProviderRefs(child, moduleSpecifier, refs, visited);
  }
}

const nonSourceClosureMetadataKeys = new Set([
  "assembly",
  "attributes",
  "evidence",
  "targetIdentity",
  "unsupportedAttributes",
  "unsupportedImplementedContracts",
  "unsupportedMembers",
]);

function sortedNonEmpty(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  return [...new Set(values)].sort();
}
