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
  DotnetTypeRef,
} from "./model.js";
import {
  dotnetTypeParameterToProviderTypeParameter,
  tryDotnetTypeRefToProviderType,
} from "./model.js";

export interface DotnetProviderDeclarationModelOptions {
  readonly dependencyModuleSpecifier?: (moduleSpecifier: string, sourceName: string) => string;
  readonly resolveModule?: (specifier: string) => DotnetModuleModel | undefined;
}

export function dotnetModuleToProviderDeclarationModel(
  module: DotnetModuleModel,
  options: DotnetProviderDeclarationModelOptions = {},
): ProviderDeclarationModel {
  const context = createDotnetDeclarationContext(module, options);
  return {
    moduleSpecifier: module.moduleSpecifier,
    providerModuleId: module.moduleSpecifier,
    exports: module.exports
      .map((declaration) => {
        const providerExport = dotnetExportToProviderExport(declaration, context);
        return providerExport === undefined
          ? undefined
          : qualifyProviderExportModuleRefs(providerExport, module.moduleSpecifier, context);
      })
      .filter((declaration): declaration is ProviderExportDeclaration => declaration !== undefined),
    evidence: [{ message: ".NET provider declaration model generated from target provider data." }],
  };
}

interface DotnetDeclarationContext {
  readonly moduleSpecifier: string;
  readonly typesBySourceName: ReadonlyMap<string, DotnetTypeDeclaration>;
  readonly sourceMembersByTargetId: Map<string, readonly ProviderMemberDeclaration[]>;
  readonly modulesBySpecifier: Map<string, DotnetModuleModel>;
  readonly dependencyModuleSpecifier?: (moduleSpecifier: string, sourceName: string) => string;
  readonly resolveModule?: (specifier: string) => DotnetModuleModel | undefined;
}

function createDotnetDeclarationContext(
  module: DotnetModuleModel,
  options: DotnetProviderDeclarationModelOptions = {},
): DotnetDeclarationContext {
  return {
    moduleSpecifier: module.moduleSpecifier,
    typesBySourceName: new Map(module.exports
      .filter((declaration): declaration is DotnetTypeDeclaration => declaration.kind === "type")
      .map((declaration) => [declaration.sourceName, declaration])),
    sourceMembersByTargetId: new Map(),
    modulesBySpecifier: new Map([[module.moduleSpecifier, module]]),
    ...(options.dependencyModuleSpecifier !== undefined ? { dependencyModuleSpecifier: options.dependencyModuleSpecifier } : {}),
    ...(options.resolveModule !== undefined ? { resolveModule: options.resolveModule } : {}),
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
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "function",
        targetIdentity: dotnetTargetIdentity(declaration.targetId, declaration.sourceName),
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "value",
        targetIdentity: dotnetTargetIdentity(declaration.targetId, declaration.sourceName),
        type,
      };
    }
    case "namespace":
      return {
        id: declaration.namespaceName,
        name: declaration.sourceName,
        kind: "namespace",
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
    id: declaration.targetId,
    name: declaration.sourceName,
    kind,
    targetIdentity: dotnetTargetIdentity(declaration.targetId, declaration.displayName ?? declaration.sourceName),
    ...(sourceType !== undefined ? { type: sourceType } : {}),
    ...(declaration.typeParameters !== undefined ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
    ...(baseType !== undefined ? { extends: [baseType] } : {}),
    ...(kind !== "type" && members !== undefined && members.length > 0 ? { members } : {}),
  };
}

function dotnetTypeSourceMembers(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
): readonly ProviderMemberDeclaration[] | undefined {
  const cached = context.sourceMembersByTargetId.get(declaration.targetId);
  if (cached !== undefined) {
    return cached;
  }
  const ownMembers = mergeProviderMemberList(declaration.members
    ?.map((member) => dotnetMemberToProviderMember(member, declaration))
    .filter((member): member is ProviderMemberDeclaration => member !== undefined) ?? []);
  const baseMembers = dotnetBaseSourceMembers(declaration, context);
  const members = mergeOwnAndBaseProviderMembers(ownMembers, baseMembers);
  context.sourceMembersByTargetId.set(declaration.targetId, members);
  return members.length === 0 ? undefined : members;
}

function dotnetBaseSourceMembers(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
): readonly ProviderMemberDeclaration[] {
  const baseType = tryDotnetBaseTypeToProviderHeritage(declaration.baseType);
  if (baseType?.kind !== "provider-ref") {
    return [];
  }
  const baseDeclaration = dotnetProviderRefToTypeDeclaration(baseType, context);
  if (baseDeclaration === undefined) {
    return [];
  }
  const baseMembers = dotnetTypeSourceMembers(baseDeclaration, context) ?? [];
  const baseModuleSpecifier = baseType.moduleSpecifier;
  const inheritedMembers = baseModuleSpecifier === undefined || baseModuleSpecifier === context.moduleSpecifier
    ? baseMembers
    : baseMembers.map((member) => qualifyProviderMemberModuleRefs(member, baseModuleSpecifier, context));
  const substitutions = getBaseTypeParameterSubstitutions(baseDeclaration, baseType);
  return substitutions.size === 0
    ? inheritedMembers
    : inheritedMembers.map((member) => substituteProviderMember(member, substitutions));
}

function mergeOwnAndBaseProviderMembers(
  ownMembers: readonly ProviderMemberDeclaration[],
  baseMembers: readonly ProviderMemberDeclaration[],
): readonly ProviderMemberDeclaration[] {
  if (baseMembers.length === 0) {
    return ownMembers;
  }
  if (ownMembers.length === 0) {
    return baseMembers;
  }
  const members = [...baseMembers];
  for (const member of ownMembers) {
    const matchingBaseMembers = baseMembers.filter((baseMember) =>
      baseMember.name === member.name &&
      baseMember.static === member.static
    );
    if (matchingBaseMembers.length === 0) {
      members.push(member);
      continue;
    }
    for (const matchingMember of matchingBaseMembers) {
      members.splice(members.indexOf(matchingMember), 1);
    }
    members.push(...mergeProviderMemberWithLocalBase(member, matchingBaseMembers));
  }
  return members;
}

function dotnetProviderRefToTypeDeclaration(
  baseType: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
  context: DotnetDeclarationContext,
): DotnetTypeDeclaration | undefined {
  if (baseType.moduleSpecifier === undefined || baseType.moduleSpecifier === context.moduleSpecifier) {
    return context.typesBySourceName.get(baseType.name);
  }
  const module = getDotnetModuleBySpecifier(baseType.moduleSpecifier, context);
  if (module === undefined) {
    return undefined;
  }
  return module.exports.find((declaration): declaration is DotnetTypeDeclaration =>
    declaration.kind === "type" && declaration.sourceName === baseType.name
  );
}

function getDotnetModuleBySpecifier(
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): DotnetModuleModel | undefined {
  const existing = context.modulesBySpecifier.get(moduleSpecifier);
  if (existing !== undefined) {
    return existing;
  }
  const resolved = context.resolveModule?.(moduleSpecifier);
  if (resolved !== undefined) {
    context.modulesBySpecifier.set(moduleSpecifier, resolved);
  }
  return resolved;
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
      member.kind !== "indexer" &&
      candidate.name === member.name &&
      candidate.static === member.static &&
      candidate.kind === member.kind &&
      candidate.signatures !== undefined &&
      member.signatures !== undefined
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

function dotnetProviderMemberId(member: DotnetMemberDeclaration): string {
  return member.kind === "constructor"
    ? dotnetMetadataNameWithoutSignature(member.targetId)
    : member.targetId;
}

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
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

function qualifyProviderMemberModuleRefs(
  member: ProviderMemberDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderMemberDeclaration {
  return {
    ...member,
    ...(member.type === undefined ? {} : { type: qualifyProviderTypeModuleRefs(member.type, moduleSpecifier, context) }),
    ...(member.signatures === undefined ? {} : { signatures: member.signatures.map((signature) => qualifyProviderSignatureModuleRefs(signature, moduleSpecifier, context)) }),
  };
}

function qualifyProviderExportModuleRefs(
  declaration: ProviderExportDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderExportDeclaration {
  return {
    ...declaration,
    ...(declaration.type === undefined ? {} : { type: qualifyProviderTypeModuleRefs(declaration.type, moduleSpecifier, context) }),
    ...(declaration.extends === undefined ? {} : { extends: declaration.extends.map((heritage) => qualifyProviderTypeModuleRefs(heritage, moduleSpecifier, context)) }),
    ...(declaration.signatures === undefined ? {} : { signatures: declaration.signatures.map((signature) => qualifyProviderSignatureModuleRefs(signature, moduleSpecifier, context)) }),
    ...(declaration.members === undefined ? {} : { members: declaration.members.map((member) => qualifyProviderMemberModuleRefs(member, moduleSpecifier, context)) }),
  };
}

function qualifyProviderSignatureModuleRefs(
  signature: ProviderSignatureDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderSignatureDeclaration {
  return {
    ...signature,
    parameters: signature.parameters.map((parameter) => qualifyProviderParameterModuleRefs(parameter, moduleSpecifier, context)),
    ...(signature.returnType === undefined ? {} : { returnType: qualifyProviderTypeModuleRefs(signature.returnType, moduleSpecifier, context) }),
  };
}

function qualifyProviderParameterModuleRefs(
  parameter: ProviderParameterDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: qualifyProviderTypeModuleRefs(parameter.type, moduleSpecifier, context),
  };
}

function qualifyProviderTypeModuleRefs(
  type: ProviderTypeExpression,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderTypeExpression {
  switch (type.kind) {
    case "provider-ref":
      {
        const declaredModuleSpecifier = type.moduleSpecifier ??
          (dotnetModuleExportsSourceName(moduleSpecifier, type.name, context) ? moduleSpecifier : undefined);
        const renderedModuleSpecifier = declaredModuleSpecifier === undefined || declaredModuleSpecifier === context.moduleSpecifier
          ? declaredModuleSpecifier
          : context.dependencyModuleSpecifier?.(declaredModuleSpecifier, type.name) ?? declaredModuleSpecifier;
        return {
          ...type,
          ...(renderedModuleSpecifier !== undefined ? { moduleSpecifier: renderedModuleSpecifier } : {}),
          ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => qualifyProviderTypeModuleRefs(argument, declaredModuleSpecifier ?? moduleSpecifier, context)) }),
        };
      }
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => qualifyProviderTypeModuleRefs(argument, moduleSpecifier, context)) }),
        ...(type.sourceShape === undefined ? {} : { sourceShape: qualifyProviderTypeModuleRefs(type.sourceShape, moduleSpecifier, context) }),
      };
    case "array":
      return { ...type, elementType: qualifyProviderTypeModuleRefs(type.elementType, moduleSpecifier, context) };
    case "tuple":
      return { ...type, elementTypes: type.elementTypes.map((elementType) => qualifyProviderTypeModuleRefs(elementType, moduleSpecifier, context)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((nestedType) => qualifyProviderTypeModuleRefs(nestedType, moduleSpecifier, context)) };
    case "function":
      return {
        ...type,
        parameters: type.parameters.map((parameter) => qualifyProviderParameterModuleRefs(parameter, moduleSpecifier, context)),
        returnType: qualifyProviderTypeModuleRefs(type.returnType, moduleSpecifier, context),
      };
    case "opaque":
      return type.sourceShape === undefined
        ? type
        : { ...type, sourceShape: qualifyProviderTypeModuleRefs(type.sourceShape, moduleSpecifier, context) };
    default:
      return type;
  }
}

function dotnetModuleExportsSourceName(
  moduleSpecifier: string,
  sourceName: string,
  context: DotnetDeclarationContext,
): boolean {
  const module = getDotnetModuleBySpecifier(moduleSpecifier, context);
  return module?.exports.some((declaration) =>
    declaration.kind === "type" && declaration.sourceName === sourceName
  ) === true;
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
  if (providerType?.kind !== "provider-ref") {
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
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "property",
        static: true,
        type: {
          kind: "target-named",
          target: "csharp",
          id: declaration.targetId,
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
        id: declaration.targetId,
        name: declaration.sourceName,
        kind: "method",
        signatures,
      };
    }
    case "value": {
      const type = tryDotnetTypeRefToProviderType(declaration.type);
      if (type === undefined) {
        return undefined;
      }
      return {
        id: declaration.targetId,
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

function dotnetMemberToProviderMember(
  member: DotnetMemberDeclaration,
  declaringType: DotnetTypeDeclaration,
): ProviderMemberDeclaration | undefined {
  if (member.kind === "event" || member.kind === "operator") {
    return undefined;
  }
  if (member.kind !== "constructor" && member.sourceName === "constructor") {
    return undefined;
  }
  if (!isSourceReadableMember(member, declaringType)) {
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
    id: dotnetProviderMemberId(member),
    name: member.sourceName,
    kind: dotnetMemberKindToProviderKind(member.kind),
    ...(member.static !== undefined ? { static: member.static } : {}),
    ...(isReadonlyProviderMember(member) ? { readonly: true } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(signatures !== undefined ? { signatures } : {}),
  };
}

function isSourceReadableMember(member: DotnetMemberDeclaration, declaringType: DotnetTypeDeclaration): boolean {
  switch (member.kind) {
    case "property":
    case "indexer":
      return member.readable === true;
    case "field":
      return declaringType.typeKind === "enum" || member.readable === true;
    case "constructor":
    case "method":
    case "operator":
    case "event":
      return true;
  }
}

function isReadonlyProviderMember(member: DotnetMemberDeclaration): boolean {
  return (member.kind === "property" || member.kind === "field" || member.kind === "indexer") && member.writable !== true;
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
  return parameterType !== undefined && isProviderTsCompatibleIndexType(parameterType);
}

function isProviderTsCompatibleIndexType(type: ReturnType<typeof tryDotnetTypeRefToProviderType>): boolean {
  return isProviderNumberIndexType(type) || type?.kind === "string";
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
    case "native-int":
    case "native-uint":
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
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
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
      throw new Error("C# events are target-only until source event subscription semantics are modeled.");
    case "operator":
      throw new Error("C# operators are target-only until source operator semantics select them explicitly.");
  }
}

function dotnetTargetIdentity(id: string, displayName: string): TargetIdentity {
  return {
    target: "csharp",
    id,
    displayName,
  };
}
