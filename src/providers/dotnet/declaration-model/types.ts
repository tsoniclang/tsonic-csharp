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
  dotnetTypeKindToProviderKind,
  tryDotnetBaseTypeToProviderHeritage,
} from "./conversions.js";
import {
  dotnetMemberToProviderMember,
  filterTsCompatibleProviderMembers,
  mergeProviderMemberList,
} from "./members.js";
import {
  mergeProviderSignatures,
  normalizeProviderSignatureTypeParameterScope,
  providerSignatureShapeKey,
} from "./signatures.js";
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
  const baseHeritage = tryDotnetBaseTypeToProviderHeritage(declaration.baseType, `${declaration.targetId}.baseType`);
  const sourceType = declaration.sourceShape === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(declaration.sourceShape, `${declaration.targetId}.sourceShape`);
  return {
    id: declaration.targetId,
    name: declaration.sourceName,
    kind,
    ...(declaration.sourceTypeFamily !== undefined ? { sourceTypeFamily: declaration.sourceTypeFamily } : {}),
    ...(sourceType !== undefined ? { type: sourceType } : {}),
    ...(declaration.typeParameters !== undefined
      ? {
        typeParameters: declaration.typeParameters.map((parameter, index) =>
          dotnetTypeParameterToProviderTypeParameter(parameter, `${declaration.targetId}.typeParameters[${index}]`)),
      }
      : {}),
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
  const inheritedMembers = inheritedSourceMembers(declaration, context, new Set());
  const ownMembers = filterTsCompatibleProviderMembers(mergeProviderMemberList(declaration.members
    ?.map((member) => dotnetMemberToProviderMember(member, declaration))
    .filter((member): member is ProviderMemberDeclaration => member !== undefined)
    .map((member) => mergeInheritedOverloadSignatures(member, inheritedMembers, declaration.typeParameters?.map((parameter) => parameter.name) ?? []))
    .filter((member): member is ProviderMemberDeclaration => member !== undefined) ?? []));
  context.sourceMembersByTargetId.set(declaration.targetId, ownMembers);
  return ownMembers.length === 0 ? undefined : ownMembers;
}

function inheritedSourceMembers(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
  visitedTargetIds: Set<string>,
): ReadonlyMap<string, readonly ProviderMemberDeclaration[]> {
  if (!visitedTargetIds.add(declaration.targetId)) {
    return new Map();
  }
  const membersByKey = new Map<string, ProviderMemberDeclaration[]>();
  const baseHeritage = tryDotnetBaseTypeToProviderHeritage(declaration.baseType, `${declaration.targetId}.baseType`);
  const baseType = baseHeritage?.type;
  if (baseType?.kind !== "provider-ref") {
    return membersByKey;
  }
  const baseDeclaration = dotnetProviderRefToTypeDeclaration(baseType, context);
  if (baseDeclaration === undefined) {
    return membersByKey;
  }
  const substitutions = getBaseTypeParameterSubstitutions(baseDeclaration, baseType);
  for (const member of dotnetTypeSourceMembers(baseDeclaration, context) ?? []) {
    const substitutedMember = substituteProviderMember(member, substitutions);
    const key = inheritedSourceMemberKey(substitutedMember);
    if (key !== undefined) {
      const members = membersByKey.get(key) ?? [];
      members.push(substitutedMember);
      membersByKey.set(key, members);
    }
  }
  for (const [key, members] of inheritedSourceMembers(baseDeclaration, context, visitedTargetIds)) {
    const substitutedMembers = members.map((member) => substituteProviderMember(member, substitutions));
    const existing = membersByKey.get(key) ?? [];
    existing.push(...substitutedMembers);
    membersByKey.set(key, existing);
  }
  return membersByKey;
}

function mergeInheritedOverloadSignatures(
  member: ProviderMemberDeclaration,
  inheritedMembers: ReadonlyMap<string, readonly ProviderMemberDeclaration[]>,
  parentTypeParameterNames: readonly string[],
): ProviderMemberDeclaration | undefined {
  const key = inheritedSourceMemberKey(member);
  if (key === undefined) {
    return member;
  }
  const inherited = inheritedMembers.get(key) ?? [];
  if (inherited.length === 0) {
    return member;
  }
  if (member.kind !== "method" || member.signatures === undefined) {
    return undefined;
  }
  const inheritedSignatures = inherited.flatMap((inheritedMember) =>
    (inheritedMember.signatures ?? []).map((signature) => normalizeProviderSignatureTypeParameterScope(signature, parentTypeParameterNames)));
  const inheritedSignatureShapes = new Set(inheritedSignatures.map(providerSignatureShapeKey));
  const signatures = member.signatures.filter((signature) =>
    !inheritedSignatureShapes.has(providerSignatureShapeKey(signature)));
  const mergedSignatures = mergeProviderSignatures([
    ...inheritedSignatures,
    ...signatures,
  ]);
  if (mergedSignatures === undefined || mergedSignatures.length === 0) {
    return undefined;
  }
  return { ...member, signatures: mergedSignatures };
}

function inheritedSourceMemberKey(member: ProviderMemberDeclaration): string | undefined {
  if (member.static === true || member.kind === "constructor") {
    return undefined;
  }
  return `${member.kind}:${JSON.stringify(member.name)}`;
}
