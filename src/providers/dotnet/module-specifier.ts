export const dotnetPackageName = "@tsonic/dotnet";
export const dotnetModulePrefix = `${dotnetPackageName}/`;
export const dotnetModuleExtension = ".js";

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

export function parseDotnetModuleSpecifier(specifier: string): DotnetModuleSpecifier | undefined {
  if (!specifier.startsWith(dotnetModulePrefix) || !specifier.endsWith(dotnetModuleExtension)) {
    return undefined;
  }
  const subpath = specifier.slice(dotnetModulePrefix.length, -dotnetModuleExtension.length);
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

export function createDotnetModuleSpecifier(namespaceName: string): string {
  if (namespaceName.length === 0 || namespaceName.includes("/") || namespaceName.includes("..")) {
    throw new Error(`Invalid .NET namespace '${namespaceName}'.`);
  }
  return `${dotnetModulePrefix}${namespaceName}${dotnetModuleExtension}`;
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
