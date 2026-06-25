import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
} from "@tsonic/tsts";
import type { DotnetTypeDeclaration } from "../model.js";
import {
  dotnetTypeParameterToProviderTypeParameter,
  tryDotnetTypeRefToProviderType,
} from "../model.js";
import type { DotnetDeclarationContext } from "./context.js";
import { dotnetProviderRefToTypeDeclaration } from "./context.js";
import {
  dotnetTargetIdentity,
  dotnetTypeKindToProviderKind,
  tryDotnetBaseTypeToProviderHeritage,
} from "./conversions.js";
import {
  dotnetMemberToProviderMember,
  mergeOwnAndBaseProviderMembers,
  mergeProviderMemberList,
} from "./members.js";
import { qualifyProviderMemberModuleRefs } from "./module-refs.js";
import {
  getBaseTypeParameterSubstitutions,
  substituteProviderMember,
} from "./substitutions.js";

export function dotnetTypeToProviderExport(
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
  const baseMembers = (dotnetTypeSourceMembers(baseDeclaration, context) ?? [])
    .filter((member) => member.static !== true);
  const baseModuleSpecifier = baseType.moduleSpecifier;
  const inheritedMembers = baseModuleSpecifier === undefined || baseModuleSpecifier === context.moduleSpecifier
    ? baseMembers
    : baseMembers.map((member) => qualifyProviderMemberModuleRefs(member, baseModuleSpecifier, context));
  const substitutions = getBaseTypeParameterSubstitutions(baseDeclaration, baseType);
  return substitutions.size === 0
    ? inheritedMembers
    : inheritedMembers.map((member) => substituteProviderMember(member, substitutions));
}
