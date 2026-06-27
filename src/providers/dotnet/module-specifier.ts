export const dotnetPackageName = "@tsonic/dotnet";
export const dotnetModulePrefix = `${dotnetPackageName}/`;
export const dotnetModuleExtension = ".js";
const dotnetProviderDependencyPrefix = "tsts-provider://tsonic-dotnet-dependency/";

export interface DotnetModuleSpecifier {
  readonly moduleSpecifier: string;
  readonly namespaceName: string;
  readonly subpath: string;
}

export interface DotnetProviderDependencyModuleSpecifier {
  readonly providerId: string;
  readonly moduleSpecifier: string;
  readonly requestedExports: readonly string[];
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

export function createDotnetProviderDependencyModuleSpecifier(
  providerId: string,
  moduleSpecifier: string,
  requestedExports: readonly string[],
): string {
  const parsed = parseDotnetModuleSpecifier(moduleSpecifier);
  if (providerId.length === 0 || parsed === undefined || requestedExports.length === 0) {
    throw new Error("Invalid .NET provider dependency module specifier input.");
  }
  return [
    dotnetProviderDependencyPrefix,
    encodeURIComponent(providerId),
    "/",
    encodeURIComponent(moduleSpecifier),
    "/",
    encodeURIComponent([...requestedExports].sort().join(",")),
    dotnetModuleExtension,
  ].join("");
}

export function parseDotnetProviderDependencyModuleSpecifier(
  specifier: string,
): DotnetProviderDependencyModuleSpecifier | undefined {
  if (!specifier.startsWith(dotnetProviderDependencyPrefix) || !specifier.endsWith(dotnetModuleExtension)) {
    return undefined;
  }
  const body = specifier.slice(dotnetProviderDependencyPrefix.length, -dotnetModuleExtension.length);
  const parts = body.split("/");
  if (parts.length !== 3) {
    return undefined;
  }
  const providerId = decodeURIComponent(parts[0] ?? "");
  const moduleSpecifier = decodeURIComponent(parts[1] ?? "");
  const requestedExports = decodeURIComponent(parts[2] ?? "")
    .split(",")
    .filter((exportName) => exportName.length > 0);
  if (providerId.length === 0 || parseDotnetModuleSpecifier(moduleSpecifier) === undefined || requestedExports.length === 0) {
    return undefined;
  }
  return {
    providerId,
    moduleSpecifier,
    requestedExports: [...new Set(requestedExports)].sort(),
  };
}
