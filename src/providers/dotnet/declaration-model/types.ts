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
  dotnetMembersToProviderMembers,
  filterTsCompatibleProviderMembers,
  mergeProviderMemberList,
  providerMemberInheritanceKey,
} from "./members.js";
import {
  mergeProviderSignatures,
  normalizeProviderSignatureTypeParameterScope,
  providerSignatureCallShapeKey,
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
  const inherited = inheritedSourceMembers(declaration, context, new Set());
  const parentTypeParameterNames = declaration.typeParameters?.map((parameter) => parameter.name) ?? [];
  const ownMembers = filterTsCompatibleProviderMembers(mergeProviderMemberList(
    dotnetMembersToProviderMembers(declaration.members ?? [], declaration, {
      inheritedConcreteMethodCallShapes: providerConcreteMethodCallShapes(
        inherited.concreteMethodsByKey,
        parentTypeParameterNames,
      ),
    })
    .map((member) => mergeInheritedOverloadSignatures(member, inherited.membersByKey, parentTypeParameterNames))
    .filter((member): member is ProviderMemberDeclaration => member !== undefined)));
  context.sourceMembersByTargetId.set(declaration.targetId, ownMembers);
  return ownMembers.length === 0 ? undefined : ownMembers;
}

function inheritedSourceMembers(
  declaration: DotnetTypeDeclaration,
  context: DotnetDeclarationContext,
  visitedTargetIds: Set<string>,
): InheritedProviderMembers {
  if (!visitedTargetIds.add(declaration.targetId)) {
    return emptyInheritedProviderMembers();
  }
  const membersByKey = new Map<string, ProviderMemberDeclaration[]>();
  const concreteMethodsByKey = new Map<string, ProviderMemberDeclaration[]>();
  const baseHeritage = tryDotnetBaseTypeToProviderHeritage(declaration.baseType, `${declaration.targetId}.baseType`);
  const baseType = baseHeritage?.type;
  if (baseType?.kind !== "provider-ref") {
    return { membersByKey, concreteMethodsByKey };
  }
  const baseDeclaration = dotnetProviderRefToTypeDeclaration(
    baseType,
    context,
    declaration.baseType?.kind === "named" ? declaration.baseType.targetId : undefined,
  );
  if (baseDeclaration === undefined) {
    return { membersByKey, concreteMethodsByKey };
  }
  const substitutions = getBaseTypeParameterSubstitutions(baseDeclaration, baseType);
  for (const member of dotnetTypeSourceMembers(baseDeclaration, context) ?? []) {
    const substitutedMember = substituteProviderMember(member, substitutions);
    const key = providerMemberInheritanceKey(substitutedMember);
    if (key !== undefined) {
      const members = membersByKey.get(key) ?? [];
      members.push(substitutedMember);
      membersByKey.set(key, members);
    }
  }
  for (const sourceMember of baseDeclaration.members ?? []) {
    if (sourceMember.sourceProjection === "extension-method") {
      continue;
    }
    const providerMember = dotnetMemberToProviderMember(sourceMember, baseDeclaration);
    if (providerMember?.kind !== "method") {
      continue;
    }
    const substitutedMember = substituteProviderMember(providerMember, substitutions);
    const key = providerMemberInheritanceKey(substitutedMember);
    if (key !== undefined) {
      const methods = concreteMethodsByKey.get(key) ?? [];
      methods.push(substitutedMember);
      concreteMethodsByKey.set(key, methods);
    }
  }
  const inherited = inheritedSourceMembers(baseDeclaration, context, visitedTargetIds);
  for (const [key, members] of inherited.membersByKey) {
    const substitutedMembers = members.map((member) => substituteProviderMember(member, substitutions));
    const existing = membersByKey.get(key) ?? [];
    existing.push(...substitutedMembers);
    membersByKey.set(key, existing);
  }
  for (const [key, methods] of inherited.concreteMethodsByKey) {
    const substitutedMethods = methods.map((member) => substituteProviderMember(member, substitutions));
    const existing = concreteMethodsByKey.get(key) ?? [];
    existing.push(...substitutedMethods);
    concreteMethodsByKey.set(key, existing);
  }
  return { membersByKey, concreteMethodsByKey };
}

interface InheritedProviderMembers {
  readonly membersByKey: ReadonlyMap<string, readonly ProviderMemberDeclaration[]>;
  readonly concreteMethodsByKey: ReadonlyMap<string, readonly ProviderMemberDeclaration[]>;
}

function emptyInheritedProviderMembers(): InheritedProviderMembers {
  return {
    membersByKey: new Map(),
    concreteMethodsByKey: new Map(),
  };
}

function providerConcreteMethodCallShapes(
  membersByKey: ReadonlyMap<string, readonly ProviderMemberDeclaration[]>,
  parentTypeParameterNames: readonly string[],
): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map([...membersByKey.entries()].map(([key, members]) => [
    key,
    new Set(members.flatMap((member) =>
      (member.signatures ?? []).map((signature) =>
        providerSignatureCallShapeKey(
          normalizeProviderSignatureTypeParameterScope(
            signature,
            parentTypeParameterNames,
          ),
        )))),
  ]));
}

function mergeInheritedOverloadSignatures(
  member: ProviderMemberDeclaration,
  inheritedMembers: ReadonlyMap<string, readonly ProviderMemberDeclaration[]>,
  parentTypeParameterNames: readonly string[],
): ProviderMemberDeclaration | undefined {
  const key = providerMemberInheritanceKey(member);
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
  const localSignatureIds = new Set(member.signatures.map((signature) => signature.id));
  const mergedSignatures = mergeProviderSignatures([
    ...inheritedSignatures.filter((signature) => !localSignatureIds.has(signature.id)),
    ...member.signatures,
  ]);
  if (mergedSignatures === undefined || mergedSignatures.length === 0) {
    return undefined;
  }
  return { ...member, signatures: mergedSignatures };
}
