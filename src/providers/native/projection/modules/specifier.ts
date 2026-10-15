export const dotnetPackageName = "@tsonic/dotnet";
export const dotnetModulePrefix = `${dotnetPackageName}/`;
export const dotnetModuleExtension = ".js";

export interface DotnetModuleSpecifierPolicy {
  readonly packageName: string;
  readonly modulePrefix: string;
}

export interface DotnetAssemblySourcePackage {
  readonly assemblyName: string;
  readonly packageName: string;
}

export const dotnetModuleSpecifierPolicy = createDotnetModuleSpecifierPolicy(dotnetPackageName);

export interface DotnetModuleSpecifier {
  readonly moduleSpecifier: string;
  readonly namespaceName: string;
  readonly subpath: string;
  readonly externAlias?: DotnetExternAliasSpecifier;
}

export interface DotnetExternAliasSpecifier {
  readonly alias: string;
  readonly assemblyName: string;
}

export function createDotnetModuleSpecifierPolicy(packageName: string): DotnetModuleSpecifierPolicy {
  if (!isPackageName(packageName)) {
    throw new Error(`Invalid .NET provider source package '${packageName}'.`);
  }
  return Object.freeze({
    packageName,
    modulePrefix: `${packageName}/`,
  });
}

export function normalizeDotnetAssemblySourcePackages(
  values: readonly DotnetAssemblySourcePackage[] = [],
): readonly DotnetAssemblySourcePackage[] {
  const byAssemblyName = new Map<string, DotnetAssemblySourcePackage>();
  for (const value of values) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(value.assemblyName)) {
      throw new Error(`Invalid .NET provider source assembly '${value.assemblyName}'.`);
    }
    createDotnetModuleSpecifierPolicy(value.packageName);
    if (byAssemblyName.has(value.assemblyName)) {
      throw new Error(`Duplicate .NET provider source assembly '${value.assemblyName}'.`);
    }
    byAssemblyName.set(value.assemblyName, Object.freeze({ ...value }));
  }
  return Object.freeze([...byAssemblyName.values()].sort((left, right) => left.assemblyName.localeCompare(right.assemblyName)));
}

export function parseDotnetModuleSpecifier(
  specifier: string,
  policy: DotnetModuleSpecifierPolicy = dotnetModuleSpecifierPolicy,
): DotnetModuleSpecifier | undefined {
  if (!specifier.startsWith(policy.modulePrefix) || !specifier.endsWith(dotnetModuleExtension)) {
    return undefined;
  }
  const subpath = specifier.slice(policy.modulePrefix.length, -dotnetModuleExtension.length);
  if (subpath.length === 0 || subpath.includes("..") || subpath.startsWith("/") || subpath.endsWith("/")) {
    return undefined;
  }
  const aliasSpecifier = parseDotnetAliasSubpath(subpath);
  if (aliasSpecifier !== undefined) {
    return {
      moduleSpecifier: specifier,
      namespaceName: aliasSpecifier.namespaceName,
      subpath,
      externAlias: {
        alias: aliasSpecifier.alias,
        assemblyName: aliasSpecifier.assemblyName,
      },
    };
  }
  return {
    moduleSpecifier: specifier,
    namespaceName: subpath.split("/").join("."),
    subpath,
  };
}

export function createDotnetModuleSpecifier(
  namespaceName: string,
  policy: DotnetModuleSpecifierPolicy = dotnetModuleSpecifierPolicy,
): string {
  if (namespaceName.length === 0 || namespaceName.includes("/") || namespaceName.includes("..")) {
    throw new Error(`Invalid .NET namespace '${namespaceName}'.`);
  }
  return `${policy.modulePrefix}${namespaceName}${dotnetModuleExtension}`;
}

function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(value);
}

function parseDotnetAliasSubpath(
  subpath: string,
): { readonly alias: string; readonly assemblyName: string; readonly namespaceName: string } | undefined {
  const segments = subpath.split("/");
  if (segments[0] !== "aliases") {
    return undefined;
  }
  if (segments.length < 4) {
    return undefined;
  }
  const alias = segments[1]!;
  const assemblyName = segments[2]!;
  const namespaceSegments = segments.slice(3);
  if (!isCsharpExternAliasIdentifier(alias) || !isDotnetAssemblySimpleName(assemblyName) || namespaceSegments.some((segment) => segment.length === 0)) {
    return undefined;
  }
  return {
    alias,
    assemblyName,
    namespaceName: namespaceSegments.join("."),
  };
}

function isCsharpExternAliasIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isDotnetAssemblySimpleName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value);
}
