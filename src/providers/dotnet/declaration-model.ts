import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeParameterDeclaration,
  TargetIdentity,
} from "@tsonic/tsts";
import type {
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetModuleModel,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeParameterDeclaration,
} from "./model.js";
import {
  dotnetTypeParameterToProviderTypeParameter,
  dotnetTypeRefToProviderType,
} from "./model.js";

export function dotnetModuleToProviderDeclarationModel(module: DotnetModuleModel): ProviderDeclarationModel {
  return {
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: module.moduleSpecifier,
    exports: module.exports.map(dotnetExportToProviderExport),
    evidence: [{ message: ".NET provider declaration model generated from target provider data." }],
  };
}

export function dotnetExportToProviderExport(declaration: DotnetExportDeclaration): ProviderExportDeclaration {
  switch (declaration.kind) {
    case "type":
      return dotnetTypeToProviderExport(declaration);
    case "function":
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "function",
        targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.sourceName),
        signatures: declaration.signatures.map((signature) => dotnetSignatureToProviderSignature(signature)),
      };
    case "value":
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "value",
        targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.sourceName),
        type: dotnetTypeRefToProviderType(declaration.type),
      };
    case "namespace":
      return {
        id: declaration.namespaceName,
        name: declaration.sourceName,
        kind: "namespace",
        targetIdentity: dotnetTargetIdentity(declaration.namespaceName, declaration.sourceName),
        members: declaration.exports.map(dotnetExportToNamespaceMember),
      };
  }
}

function dotnetTypeToProviderExport(declaration: DotnetTypeDeclaration): ProviderExportDeclaration {
  return {
    id: declaration.metadataName,
    name: declaration.sourceName,
    kind: dotnetTypeKindToProviderKind(declaration.typeKind),
    targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.displayName ?? declaration.sourceName),
    ...(declaration.sourceShape !== undefined ? { type: dotnetTypeRefToProviderType(declaration.sourceShape) } : {}),
    ...(declaration.typeParameters !== undefined ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
    ...(declaration.members !== undefined ? { members: declaration.members.map(dotnetMemberToProviderMember) } : {}),
  };
}

function dotnetExportToNamespaceMember(declaration: DotnetExportDeclaration): ProviderMemberDeclaration {
  switch (declaration.kind) {
    case "type":
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type: {
          kind: "target-named",
          target: "csharp",
          id: declaration.metadataName,
          ...(declaration.displayName !== undefined ? { displayName: declaration.displayName } : {}),
        },
      };
    case "function":
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "method",
        static: true,
        signatures: declaration.signatures.map((signature) => dotnetSignatureToProviderSignature(signature)),
      };
    case "value":
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type: dotnetTypeRefToProviderType(declaration.type),
      };
    case "namespace":
      return {
        id: declaration.namespaceName,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type: { kind: "opaque", id: declaration.namespaceName, displayName: declaration.sourceName },
      };
  }
}

function dotnetMemberToProviderMember(member: DotnetMemberDeclaration): ProviderMemberDeclaration {
  return {
    id: member.metadataName,
    name: member.sourceName,
    kind: dotnetMemberKindToProviderKind(member.kind),
    ...(member.static !== undefined ? { static: member.static } : {}),
    ...(member.type !== undefined ? { type: dotnetTypeRefToProviderType(member.type) } : {}),
    ...(member.signatures !== undefined
      ? { signatures: member.signatures.map((signature) => dotnetSignatureToProviderSignature(signature, member.kind === "constructor" ? undefined : member.targetName)) }
      : {}),
  };
}

function dotnetSignatureToProviderSignature(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
): ProviderSignatureDeclaration {
  return {
    id: signature.id,
    ...(signature.targetName !== undefined || memberTargetName !== undefined ? { name: signature.targetName ?? memberTargetName } : {}),
    parameters: signature.parameters.map(dotnetParameterToProviderParameter),
    ...(signature.returnType !== undefined ? { returnType: dotnetTypeRefToProviderType(signature.returnType) } : {}),
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToProviderTypeParameterStrict) } : {}),
  };
}

function dotnetParameterToProviderParameter(parameter: DotnetParameterDeclaration): ProviderParameterDeclaration {
  return {
    name: parameter.name,
    type: dotnetTypeRefToProviderType(parameter.type),
    ...(parameter.passingMode !== "by-value" ? { passingMode: parameter.passingMode } : {}),
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { rest: true } : {}),
  };
}

function dotnetTypeParameterToProviderTypeParameterStrict(typeParameter: DotnetTypeParameterDeclaration): ProviderTypeParameterDeclaration {
  return dotnetTypeParameterToProviderTypeParameter(typeParameter);
}

function dotnetTypeKindToProviderKind(kind: DotnetTypeDeclaration["typeKind"]): ProviderExportDeclaration["kind"] {
  switch (kind) {
    case "class":
    case "interface":
    case "enum":
      return kind;
    case "struct":
      return "class";
    case "delegate":
      return "function";
    case "opaque":
      return "opaque";
  }
}

function dotnetMemberKindToProviderKind(kind: DotnetMemberDeclaration["kind"]): ProviderMemberDeclaration["kind"] {
  switch (kind) {
    case "constructor":
    case "method":
    case "property":
    case "field":
    case "indexer":
      return kind;
    case "event":
      return "property";
    case "operator":
      return "method";
  }
}

function dotnetTargetIdentity(id: string, displayName: string): TargetIdentity {
  return {
    target: "csharp",
    id,
    displayName,
  };
}
