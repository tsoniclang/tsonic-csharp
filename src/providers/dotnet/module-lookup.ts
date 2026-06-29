import {
  createDotnetModuleSpecifier,
  dotnetModulePrefix,
} from "./module-specifier.js";
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

export function dotnetModuleSpecifierForTargetId(targetId: string): string | undefined {
  const syntheticModuleSpecifier = syntheticTargetModules.get(targetId);
  if (syntheticModuleSpecifier !== undefined) {
    return syntheticModuleSpecifier;
  }
  const metadataName = targetId.includes("::") ? targetId.slice(targetId.lastIndexOf("::") + 2) : targetId;
  const typeMetadataName = metadataName.slice(0, firstSignatureDelimiter(metadataName));
  const declaringTypeName = typeMetadataName.includes("+")
    ? typeMetadataName.slice(0, typeMetadataName.indexOf("+"))
    : typeMetadataName;
  return dotnetModuleSpecifierForMetadataName(declaringTypeName);
}

export function dotnetModuleSpecifierForMetadataName(metadataName: string): string | undefined {
  const normalizedName = metadataName
    .slice(0, firstSignatureDelimiter(metadataName))
    .replace(/\+/gu, ".");
  const unqualifiedName = normalizedName.includes("`")
    ? normalizedName.slice(0, normalizedName.indexOf("`"))
    : normalizedName;
  const namespaceName = unqualifiedName.includes(".")
    ? unqualifiedName.slice(0, unqualifiedName.lastIndexOf("."))
    : "";
  return namespaceName.length === 0 ? undefined : `${dotnetModulePrefix}${namespaceName}.js`;
}

function firstSignatureDelimiter(value: string): number {
  const paren = value.indexOf("(");
  const generic = value.indexOf("<");
  const candidates = [paren, generic].filter((index) => index >= 0);
  return candidates.length === 0 ? value.length : Math.min(...candidates);
}
