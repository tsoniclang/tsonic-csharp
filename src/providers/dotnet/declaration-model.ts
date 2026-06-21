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
  tryDotnetTypeRefToProviderType,
} from "./model.js";

export function dotnetModuleToProviderDeclarationModel(module: DotnetModuleModel): ProviderDeclarationModel {
  return {
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: module.moduleSpecifier,
    exports: module.exports
      .map(dotnetExportToProviderExport)
      .filter((declaration): declaration is ProviderExportDeclaration => declaration !== undefined),
    evidence: [{ message: ".NET provider declaration model generated from target provider data." }],
  };
}

export function dotnetExportToProviderExport(declaration: DotnetExportDeclaration): ProviderExportDeclaration | undefined {
  switch (declaration.kind) {
    case "type":
      return dotnetTypeToProviderExport(declaration);
    case "function": {
      const signatures = declaration.signatures
        .map((signature) => dotnetSignatureToProviderSignature(signature))
        .filter((signature): signature is ProviderSignatureDeclaration => signature !== undefined);
      if (signatures.length === 0) {
        return undefined;
      }
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "function",
        targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.sourceName),
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "value",
        targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.sourceName),
        type,
      };
    }
    case "namespace":
      return {
        id: declaration.namespaceName,
        name: declaration.sourceName,
        kind: "namespace",
        targetIdentity: dotnetTargetIdentity(declaration.namespaceName, declaration.sourceName),
        members: declaration.exports
          .map(dotnetExportToNamespaceMember)
          .filter((member): member is ProviderMemberDeclaration => member !== undefined),
      };
  }
}

function dotnetTypeToProviderExport(declaration: DotnetTypeDeclaration): ProviderExportDeclaration {
  const kind = dotnetTypeKindToProviderKind(declaration.typeKind);
  const members = declaration.members
    ?.map(dotnetMemberToProviderMember)
    .filter((member): member is ProviderMemberDeclaration => member !== undefined);
  const sourceType = declaration.sourceShape === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(declaration.sourceShape);
  return {
    id: declaration.metadataName,
    name: declaration.sourceName,
    kind,
    targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.displayName ?? declaration.sourceName),
    ...(sourceType !== undefined ? { type: sourceType } : {}),
    ...(declaration.typeParameters !== undefined ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
    ...(kind !== "type" && members !== undefined && members.length > 0 ? { members } : {}),
  };
}

function dotnetExportToNamespaceMember(declaration: DotnetExportDeclaration): ProviderMemberDeclaration | undefined {
  switch (declaration.kind) {
    case "type": {
      const sourceType = declaration.sourceShape === undefined
        ? undefined
        : tryDotnetTypeRefToProviderType(declaration.sourceShape);
      if (sourceType === undefined) {
        return undefined;
      }
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
          sourceShape: sourceType,
        },
      };
    }
    case "function": {
      const signatures = declaration.signatures
        .map((signature) => dotnetSignatureToProviderSignature(signature))
        .filter((signature): signature is ProviderSignatureDeclaration => signature !== undefined);
      if (signatures.length === 0) {
        return undefined;
      }
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "method",
        static: true,
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.metadataName,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type,
      };
    }
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

function dotnetMemberToProviderMember(member: DotnetMemberDeclaration): ProviderMemberDeclaration | undefined {
  const type = member.type === undefined ? undefined : tryDotnetTypeRefToProviderType(member.type);
  if (member.type !== undefined && type === undefined) {
    return undefined;
  }
  const signatures = member.signatures
    ?.map((signature) => dotnetSignatureToProviderSignature(signature, member.kind === "constructor" ? undefined : member.targetName))
    .filter((signature): signature is ProviderSignatureDeclaration => signature !== undefined);
  if (member.signatures !== undefined && (signatures === undefined || signatures.length === 0)) {
    return undefined;
  }
  return {
    id: member.metadataName,
    name: member.sourceName,
    kind: dotnetMemberKindToProviderKind(member.kind),
    ...(member.static !== undefined ? { static: member.static } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(signatures !== undefined ? { signatures } : {}),
  };
}

function dotnetSignatureToProviderSignature(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
): ProviderSignatureDeclaration | undefined {
  const parameters = signature.parameters.map(dotnetParameterToProviderParameter);
  const returnType = signature.returnType === undefined ? undefined : tryDotnetTypeRefToProviderType(signature.returnType);
  if (parameters.some((parameter) => parameter === undefined) || (signature.returnType !== undefined && returnType === undefined)) {
    return undefined;
  }
  return {
    id: signature.id,
    ...(signature.targetName !== undefined || memberTargetName !== undefined ? { name: signature.targetName ?? memberTargetName } : {}),
    parameters: parameters as ProviderParameterDeclaration[],
    ...(returnType !== undefined ? { returnType } : {}),
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToProviderTypeParameterStrict) } : {}),
  };
}

function dotnetParameterToProviderParameter(parameter: DotnetParameterDeclaration): ProviderParameterDeclaration | undefined {
  const type = tryDotnetTypeRefToProviderType(parameter.type);
  if (type === undefined) {
    return undefined;
  }
  return {
    name: parameter.name,
    type,
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
    case "delegate":
      return "class";
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
