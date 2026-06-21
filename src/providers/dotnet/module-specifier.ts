export const dotnetPackageName = "@tsonic/dotnet";
export const dotnetModulePrefix = `${dotnetPackageName}/`;
export const dotnetModuleExtension = ".js";

export interface DotnetModuleSpecifier {
  readonly moduleSpecifier: string;
  readonly namespaceName: string;
  readonly subpath: string;
}

export function parseDotnetModuleSpecifier(specifier: string): DotnetModuleSpecifier | undefined {
  if (!specifier.startsWith(dotnetModulePrefix) || !specifier.endsWith(dotnetModuleExtension)) {
    return undefined;
  }
  const subpath = specifier.slice(dotnetModulePrefix.length, -dotnetModuleExtension.length);
  if (subpath.length === 0 || subpath.includes("..") || subpath.startsWith("/") || subpath.endsWith("/")) {
    return undefined;
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

