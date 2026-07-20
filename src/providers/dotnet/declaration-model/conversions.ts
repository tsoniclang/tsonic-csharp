import type {
  ProviderExportDeclaration,
  ProviderHeritageDeclaration,
  ProviderMemberDeclaration,
  TargetIdentity,
} from "@tsonic/tsts";
import type {
  DotnetMemberDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeRef,
} from "../model.js";
import { tryDotnetTypeRefToProviderType } from "../model.js";

export function tryDotnetBaseTypeToProviderHeritage(
  baseType: DotnetTypeRef | undefined,
  identityPath: string,
): ProviderHeritageDeclaration | undefined {
  if (baseType === undefined) {
    return undefined;
  }
  const providerType = tryDotnetTypeRefToProviderType(
    baseType.kind === "named" && baseType.sourceShape !== undefined ? baseType.sourceShape : baseType,
    identityPath,
  );
  if (providerType?.kind !== "provider-ref") {
    return undefined;
  }
  return { kind: "extends", type: providerType };
}

export function dotnetTypeKindToProviderKind(kind: DotnetTypeDeclaration["typeKind"]): ProviderExportDeclaration["kind"] {
  switch (kind) {
    case "class":
    case "interface":
    case "enum":
      return kind;
    case "struct":
    case "delegate":
      return "class";
    case "opaque":
      return "opaque";
  }
}

export function dotnetMemberKindToProviderKind(kind: DotnetMemberDeclaration["kind"]): ProviderMemberDeclaration["kind"] {
  switch (kind) {
    case "constructor":
    case "method":
    case "property":
    case "field":
    case "indexer":
      return kind;
    case "event":
      throw new Error("C# events are target-only until source event subscription semantics are modeled.");
    case "operator":
      throw new Error("C# operators are target-only until source operator semantics select them explicitly.");
  }
}

export function dotnetTargetIdentity(id: string, displayName: string): TargetIdentity {
  return {
    target: "csharp",
    id,
    displayName,
  };
}
