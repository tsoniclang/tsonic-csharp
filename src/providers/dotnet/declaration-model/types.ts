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
  mergeProviderMemberList,
} from "./members.js";

export function dotnetTypeToProviderExport(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
): ProviderExportDeclaration {
  const kind = dotnetTypeKindToProviderKind(declaration.typeKind);
  const members = dotnetTypeSourceMembers(declaration, context);
  const baseHeritage = tryDotnetBaseTypeToProviderHeritage(declaration.baseType);
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
    ...(baseHeritage !== undefined ? { heritage: [baseHeritage] } : {}),
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
  const inheritedKeys = inheritedSourceMemberKeys(declaration, context, new Set());
  const ownMembers = mergeProviderMemberList(declaration.members
    ?.map((member) => dotnetMemberToProviderMember(member, declaration))
    .filter((member): member is ProviderMemberDeclaration => member !== undefined)
    .filter((member) => {
      const key = inheritedSourceMemberKey(member);
      return key === undefined || !inheritedKeys.has(key);
    }) ?? []);
  context.sourceMembersByTargetId.set(declaration.targetId, ownMembers);
  return ownMembers.length === 0 ? undefined : ownMembers;
}

function inheritedSourceMemberKeys(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
  visitedTargetIds: Set<string>,
): ReadonlySet<string> {
  if (!visitedTargetIds.add(declaration.targetId)) {
    return new Set();
  }
  const keys = new Set<string>();
  const baseHeritage = tryDotnetBaseTypeToProviderHeritage(declaration.baseType);
  const baseType = baseHeritage?.type;
  if (baseType?.kind !== "provider-ref") {
    return keys;
  }
  const baseDeclaration = dotnetProviderRefToTypeDeclaration(baseType, context);
  if (baseDeclaration === undefined) {
    return keys;
  }
  for (const member of dotnetTypeSourceMembers(baseDeclaration, context) ?? []) {
    const key = inheritedSourceMemberKey(member);
    if (key !== undefined) {
      keys.add(key);
    }
  }
  for (const key of inheritedSourceMemberKeys(baseDeclaration, context, visitedTargetIds)) {
    keys.add(key);
  }
  return keys;
}

function inheritedSourceMemberKey(member: ProviderMemberDeclaration): string | undefined {
  if (member.static === true || member.kind === "constructor") {
    return undefined;
  }
  return `${member.kind}:${JSON.stringify(member.name)}`;
}
