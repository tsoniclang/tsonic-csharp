import {
  createDotnetModuleSpecifier,
  dotnetPackageName,
  dotnetModuleSpecifierPolicy,
} from "./specifier.js";
import type {
  DotnetModuleSpecifierPolicy,
} from "./specifier.js";
import {
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
} from "./native-array.js";

const syntheticTargetModules = new Map<string, string>([
  [dotnetNativeArrayTypeId, createDotnetModuleSpecifier("System")],
  [dotnetNativeArrayCreateMemberId, createDotnetModuleSpecifier("System")],
  [dotnetNativeArrayLengthMemberId, createDotnetModuleSpecifier("System")],
  [dotnetNativeArrayIndexerMemberId, createDotnetModuleSpecifier("System")],
]);

export function dotnetModuleSpecifierForTargetId(
  targetId: string,
  policy: DotnetModuleSpecifierPolicy = dotnetModuleSpecifierPolicy,
): string | undefined {
  const syntheticModuleSpecifier = syntheticTargetModules.get(targetId);
  if (syntheticModuleSpecifier !== undefined && policy.packageName === dotnetPackageName) {
    return syntheticModuleSpecifier;
  }
  const identityParts = targetId.split("::");
  if (
    identityParts.length !== 2 ||
    identityParts[0]?.length === 0 ||
    identityParts[1]?.length === 0
  ) {
    return undefined;
  }
  const metadataName = identityParts[1]!;
  const typeMetadataName = metadataName.slice(0, firstSignatureDelimiter(metadataName));
  const declaringTypeName = typeMetadataName.includes("+")
    ? typeMetadataName.slice(0, typeMetadataName.indexOf("+"))
    : typeMetadataName;
  return dotnetModuleSpecifierForMetadataName(declaringTypeName, policy);
}

export function dotnetModuleSpecifierForMetadataName(
  metadataName: string,
  policy: DotnetModuleSpecifierPolicy = dotnetModuleSpecifierPolicy,
): string | undefined {
  const normalizedName = metadataName
    .slice(0, firstSignatureDelimiter(metadataName))
    .replace(/\+/gu, ".");
  const unqualifiedName = normalizedName.includes("`")
    ? normalizedName.slice(0, normalizedName.indexOf("`"))
    : normalizedName;
  const namespaceName = unqualifiedName.includes(".")
    ? unqualifiedName.slice(0, unqualifiedName.lastIndexOf("."))
    : "";
  return namespaceName.length === 0 ||
      namespaceName.includes("/") ||
      namespaceName.split(".").some((segment) => segment.length === 0)
    ? undefined
    : createDotnetModuleSpecifier(namespaceName, policy);
}

function firstSignatureDelimiter(value: string): number {
  const paren = value.indexOf("(");
  const generic = value.indexOf("<");
  const candidates = [paren, generic].filter((index) => index >= 0);
  return candidates.length === 0 ? value.length : Math.min(...candidates);
}
