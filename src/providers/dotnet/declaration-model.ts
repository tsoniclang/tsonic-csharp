import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
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
  DotnetTypeRef,
} from "./model.js";
import {
  dotnetTypeParameterToProviderTypeParameter,
  tryDotnetTypeRefToProviderType,
} from "./model.js";

export function dotnetModuleToProviderDeclarationModel(module: DotnetModuleModel): ProviderDeclarationModel {
  const context = createDotnetDeclarationContext(module);
  return {
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: module.moduleSpecifier,
    exports: module.exports
      .map((declaration) => dotnetExportToProviderExport(declaration, context))
      .filter((declaration): declaration is ProviderExportDeclaration => declaration !== undefined),
    evidence: [{ message: ".NET provider declaration model generated from target provider data." }],
  };
}

interface DotnetDeclarationContext {
  readonly typesBySourceName: ReadonlyMap<string, DotnetTypeDeclaration>;
  readonly sourceMembersByMetadataName: Map<string, readonly ProviderMemberDeclaration[]>;
}

function createDotnetDeclarationContext(module: DotnetModuleModel): DotnetDeclarationContext {
  return {
    typesBySourceName: new Map(module.exports
      .filter((declaration): declaration is DotnetTypeDeclaration => declaration.kind === "type")
      .map((declaration) => [declaration.sourceName, declaration])),
    sourceMembersByMetadataName: new Map(),
  };
}

export function dotnetExportToProviderExport(
  declaration: DotnetExportDeclaration,
  context: DotnetDeclarationContext = createDotnetDeclarationContext({ moduleSpecifier: "", namespaceName: "", exports: [declaration] }),
): ProviderExportDeclaration | undefined {
  switch (declaration.kind) {
    case "type":
      return dotnetTypeToProviderExport(declaration, context);
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

function dotnetTypeToProviderExport(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
): ProviderExportDeclaration {
  const kind = dotnetTypeKindToProviderKind(declaration.typeKind);
  const members = dotnetTypeSourceMembers(declaration, context);
  const baseType = tryDotnetBaseTypeToProviderHeritage(declaration.baseType);
  const sourceType = declaration.sourceShape === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(declaration.sourceShape);
  return {
    id: declaration.metadataName,
    name: declaration.sourceName,
    kind,
    targetIdentity: dotnetTargetIdentity(declaration.metadataName, declaration.displayName ?? declaration.sourceName),
    ...(sourceType !== undefined ? { type: sourceType } : {}),
    ...(declaration.typeParameters !== undefined ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToProviderSourceTypeParameter) } : {}),
    ...(baseType !== undefined ? { extends: [baseType] } : {}),
    ...(kind !== "type" && members !== undefined && members.length > 0 ? { members } : {}),
  };
}

function dotnetTypeSourceMembers(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
): readonly ProviderMemberDeclaration[] | undefined {
  const cached = context.sourceMembersByMetadataName.get(declaration.metadataName);
  if (cached !== undefined) {
    return cached;
  }
  const ownMembers = declaration.members
    ?.map(dotnetMemberToProviderMember)
    .filter((member): member is ProviderMemberDeclaration => member !== undefined) ?? [];
  const baseMembers = dotnetLocalBaseSourceMembers(declaration, context);
  const members = baseMembers.length === 0
    ? ownMembers
    : ownMembers.flatMap((member) => mergeProviderMemberWithLocalBase(member, baseMembers));
  context.sourceMembersByMetadataName.set(declaration.metadataName, members);
  return members.length === 0 ? undefined : members;
}

function dotnetLocalBaseSourceMembers(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
): readonly ProviderMemberDeclaration[] {
  const baseType = tryDotnetBaseTypeToProviderHeritage(declaration.baseType);
  if (baseType?.kind !== "provider-ref") {
    return [];
  }
  const baseDeclaration = context.typesBySourceName.get(baseType.name);
  if (baseDeclaration === undefined) {
    return [];
  }
  const baseMembers = mergeProviderMemberList([
    ...dotnetLocalBaseSourceMembers(baseDeclaration, context),
    ...(dotnetTypeSourceMembers(baseDeclaration, context) ?? []),
  ]);
  const substitutions = getBaseTypeParameterSubstitutions(baseDeclaration, baseType);
  return substitutions.size === 0
    ? baseMembers
    : baseMembers.map((member) => substituteProviderMember(member, substitutions));
}

function mergeProviderMemberWithLocalBase(
  member: ProviderMemberDeclaration,
  baseMembers: readonly ProviderMemberDeclaration[],
): readonly ProviderMemberDeclaration[] {
  const matchingBaseMembers = baseMembers.filter((baseMember) =>
    baseMember.name === member.name &&
    baseMember.static === member.static
  );
  if (matchingBaseMembers.length === 0) {
    return [member];
  }
  if (member.kind === "method" && matchingBaseMembers.every((baseMember) => baseMember.kind === "method")) {
    return [{
      ...member,
      signatures: mergeProviderSignatures([
        ...matchingBaseMembers.flatMap((baseMember) => baseMember.signatures ?? []),
        ...(member.signatures ?? []),
      ]),
    }];
  }
  return [];
}

function mergeProviderSignatures(signatures: readonly ProviderSignatureDeclaration[]): readonly ProviderSignatureDeclaration[] {
  const byId = new Map<string, ProviderSignatureDeclaration>();
  for (const signature of signatures) {
    byId.set(providerSignatureShapeKey(signature), signature);
  }
  return [...byId.values()];
}

function providerSignatureShapeKey(signature: ProviderSignatureDeclaration): string {
  return JSON.stringify({
    typeParameters: signature.typeParameters,
    parameters: signature.parameters,
    returnType: signature.returnType,
  });
}

function mergeProviderMemberList(members: readonly ProviderMemberDeclaration[]): readonly ProviderMemberDeclaration[] {
  const merged: ProviderMemberDeclaration[] = [];
  for (const member of members) {
    const index = merged.findIndex((candidate) =>
      candidate.name === member.name &&
      candidate.static === member.static &&
      candidate.kind === "method" &&
      member.kind === "method"
    );
    if (index < 0) {
      merged.push(member);
      continue;
    }
    merged[index] = {
      ...member,
      signatures: mergeProviderSignatures([
        ...(merged[index]!.signatures ?? []),
        ...(member.signatures ?? []),
      ]),
    };
  }
  return merged;
}

function getBaseTypeParameterSubstitutions(
  baseDeclaration: DotnetTypeDeclaration,
  baseType: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
): ReadonlyMap<string, ProviderTypeExpression> {
  const substitutions = new Map<string, ProviderTypeExpression>();
  const typeParameters = baseDeclaration.typeParameters ?? [];
  const typeArguments = baseType.typeArguments ?? [];
  for (let index = 0; index < typeParameters.length && index < typeArguments.length; index++) {
    substitutions.set(typeParameters[index]!.name, typeArguments[index]!);
  }
  return substitutions;
}

function substituteProviderMember(
  member: ProviderMemberDeclaration,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderMemberDeclaration {
  return {
    ...member,
    ...(member.type === undefined ? {} : { type: substituteProviderTypeExpression(member.type, substitutions) }),
    ...(member.signatures === undefined ? {} : { signatures: member.signatures.map((signature) => substituteProviderSignature(signature, substitutions)) }),
  };
}

function substituteProviderSignature(
  signature: ProviderSignatureDeclaration,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderSignatureDeclaration {
  const scopedSubstitutions = removeScopedTypeParameters(substitutions, signature.typeParameters);
  return {
    ...signature,
    parameters: signature.parameters.map((parameter) => substituteProviderParameter(parameter, scopedSubstitutions)),
    ...(signature.returnType === undefined ? {} : { returnType: substituteProviderTypeExpression(signature.returnType, scopedSubstitutions) }),
  };
}

function substituteProviderParameter(
  parameter: ProviderParameterDeclaration,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: substituteProviderTypeExpression(parameter.type, substitutions),
  };
}

function substituteProviderTypeExpression(
  type: ProviderTypeExpression,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderTypeExpression {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "provider-ref":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteProviderTypeExpression(argument, substitutions)) }),
      };
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteProviderTypeExpression(argument, substitutions)) }),
        ...(type.sourceShape === undefined ? {} : { sourceShape: substituteProviderTypeExpression(type.sourceShape, substitutions) }),
      };
    case "array":
      return { ...type, elementType: substituteProviderTypeExpression(type.elementType, substitutions) };
    case "tuple":
      return { ...type, elementTypes: type.elementTypes.map((elementType) => substituteProviderTypeExpression(elementType, substitutions)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((nestedType) => substituteProviderTypeExpression(nestedType, substitutions)) };
    case "function": {
      const scopedSubstitutions = removeScopedTypeParameters(substitutions, type.typeParameters);
      return {
        ...type,
        parameters: type.parameters.map((parameter) => substituteProviderParameter(parameter, scopedSubstitutions)),
        returnType: substituteProviderTypeExpression(type.returnType, scopedSubstitutions),
      };
    }
    case "opaque":
      return type.sourceShape === undefined
        ? type
        : { ...type, sourceShape: substituteProviderTypeExpression(type.sourceShape, substitutions) };
    default:
      return type;
  }
}

function removeScopedTypeParameters(
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
  typeParameters: readonly ProviderTypeParameterDeclaration[] | undefined,
): ReadonlyMap<string, ProviderTypeExpression> {
  if (typeParameters === undefined || typeParameters.length === 0) {
    return substitutions;
  }
  const scoped = new Map(substitutions);
  for (const typeParameter of typeParameters) {
    scoped.delete(typeParameter.name);
  }
  return scoped;
}

function tryDotnetBaseTypeToProviderHeritage(baseType: DotnetTypeRef | undefined): ProviderTypeExpression | undefined {
  if (baseType === undefined) {
    return undefined;
  }
  const providerType = tryDotnetTypeRefToProviderType(baseType.kind === "named" && baseType.sourceShape !== undefined
    ? baseType.sourceShape
    : baseType);
  if (providerType?.kind !== "provider-ref" || providerType.moduleSpecifier !== undefined) {
    return undefined;
  }
  return providerType;
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
  if (member.kind !== "constructor" && member.sourceName === "constructor") {
    return undefined;
  }
  if (member.kind === "indexer" && !isSourceVisibleProviderIndexer(member)) {
    return undefined;
  }
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

function isSourceVisibleProviderIndexer(member: DotnetMemberDeclaration): boolean {
  if (member.signatures === undefined || member.signatures.length !== 1) {
    return false;
  }
  const signature = member.signatures[0];
  if (signature === undefined || signature.parameters.length !== 1 || signature.returnType === undefined) {
    return false;
  }
  const parameterType = tryDotnetTypeRefToProviderType(signature.parameters[0]!.type);
  return parameterType !== undefined && isProviderNumberIndexType(parameterType);
}

function isProviderNumberIndexType(type: ReturnType<typeof tryDotnetTypeRefToProviderType>): boolean {
  if (type === undefined) {
    return false;
  }
  return type.kind === "number" || (type.kind === "source-primitive" && isNumericSourcePrimitive(type.name));
}

function isNumericSourcePrimitive(name: string): boolean {
  switch (name) {
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "int64":
    case "uint64":
    case "nativeint":
    case "nativeuint":
    case "float32":
    case "float64":
    case "decimal":
      return true;
    default:
      return false;
  }
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
  return dotnetTypeParameterToProviderSourceTypeParameter(typeParameter);
}

function dotnetTypeParameterToProviderSourceTypeParameter(typeParameter: DotnetTypeParameterDeclaration): ProviderTypeParameterDeclaration {
  const providerParameter = dotnetTypeParameterToProviderTypeParameter(typeParameter);
  return {
    name: providerParameter.name,
    ...(providerParameter.variance !== undefined ? { variance: providerParameter.variance } : {}),
  };
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
