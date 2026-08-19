import type {
  ProviderMemberDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetMemberDeclaration,
  DotnetTypeDeclaration,
} from "../model/index.js";
import { tryDotnetTypeRefToProviderType } from "../model/index.js";
import { dotnetMemberKindToProviderKind } from "./conversions.js";
import {
  dotnetProviderMemberId,
  dotnetProviderSourceMemberGroupId,
} from "../relations/member-identity.js";
import {
  dotnetProviderSignatureIdsForMember,
  dotnetSignatureToProviderSignature,
  mergeProviderSignatures,
  providerSignatureCallShapeKey,
} from "./signatures.js";

export function mergeOwnAndBaseProviderMembers(
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
      providerMemberNamesEqual(baseMember, member) &&
      providerMembersHaveSameStaticness(baseMember, member)
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

export function mergeProviderMemberList(members: readonly ProviderMemberDeclaration[]): readonly ProviderMemberDeclaration[] {
  const merged: ProviderMemberDeclaration[] = [];
  for (const member of members) {
    const index = merged.findIndex((candidate) =>
      member.kind !== "indexer" &&
      providerMemberNamesEqual(candidate, member) &&
      providerMembersHaveSameStaticness(candidate, member) &&
      candidate.kind === member.kind &&
      candidate.signatures !== undefined &&
      member.signatures !== undefined
    );
    if (index < 0) {
      merged.push(member);
      continue;
    }
    merged[index] = {
      ...merged[index]!,
      signatures: mergeProviderSignatures([
        ...(merged[index]!.signatures ?? []),
        ...(member.signatures ?? []),
      ]),
    };
  }
  return merged;
}

export function dotnetMemberToProviderMember(
  member: DotnetMemberDeclaration,
  declaringType: DotnetTypeDeclaration,
): ProviderMemberDeclaration | undefined {
  if (member.kind === "event" || member.kind === "operator") {
    return undefined;
  }
  if (member.kind !== "constructor" && reservedProviderConstructorSourceNames.has(member.sourceName)) {
    return undefined;
  }
  if (!isSourceReadableMember(member, declaringType)) {
    return undefined;
  }
  if (member.kind === "indexer" && !isSourceVisibleProviderIndexer(member)) {
    return undefined;
  }
  const exactProviderMemberId = dotnetProviderMemberId(member);
  const providerMemberId = dotnetProviderSourceMemberGroupId(
    member,
    declaringType,
  );
  if (declaringType.typeKind === "enum" && member.kind === "field") {
    return {
      id: providerMemberId,
      name: member.sourceName,
      kind: "field",
    };
  }
  const type = member.type === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(
        member.type,
        `${exactProviderMemberId}.type`,
      );
  if (member.type !== undefined && type === undefined) {
    return undefined;
  }
  const memberTargetName = member.kind === "constructor" ? undefined : member.targetName;
  const sourceParameterOptions = {
    sourceParameterOffset: member.sourceParameterOffset,
    parentTypeParameterNames: declaringType.typeParameters?.map((parameter) => parameter.name) ?? [],
  };
  const providerSignatureIds = dotnetProviderSignatureIdsForMember(
    member,
    providerMemberId,
    memberTargetName,
    sourceParameterOptions,
  );
  const signatures = member.signatures
    ?.map((signature) => dotnetSignatureToProviderSignature(signature, memberTargetName, providerSignatureIds.get(signature.id), sourceParameterOptions))
    .filter((signature): signature is NonNullable<typeof signature> => signature !== undefined);
  if (member.signatures !== undefined && (signatures === undefined || signatures.length === 0)) {
    return undefined;
  }
  return {
    id: providerMemberId,
    name: member.sourceName,
    kind: dotnetMemberKindToProviderKind(member.kind),
    ...(member.sourceStatic !== undefined || member.static !== undefined ? { static: member.sourceStatic ?? member.static } : {}),
    ...(isReadonlyProviderMember(member) ? { readonly: true } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(signatures !== undefined ? { signatures: mergeProviderSignatures(signatures) } : {}),
  };
}

export function dotnetMembersToProviderMembers(
  members: readonly DotnetMemberDeclaration[],
  declaringType: DotnetTypeDeclaration,
  options: {
    readonly inheritedConcreteMethodCallShapes?: ReadonlyMap<string, ReadonlySet<string>>;
  } = {},
): readonly ProviderMemberDeclaration[] {
  const projections = members
    .filter((source) =>
      declaringType.typeKind !== "enum" ||
      source.sourceProjection !== "extension-method")
    .map((source) => ({
      source,
      declaration: dotnetMemberToProviderMember(source, declaringType),
    }))
    .filter((projection): projection is {
      readonly source: DotnetMemberDeclaration;
      readonly declaration: ProviderMemberDeclaration;
    } => projection.declaration !== undefined);
  const concreteNonMethodIdentities = new Set(
    projections
      .filter((projection) =>
        projection.source.sourceProjection !== "extension-method" &&
        projection.declaration.kind !== "method")
      .map((projection) => projection.declaration.id),
  );
  const concreteMethodCallShapes = new Map<string, Set<string>>(
    [...(options.inheritedConcreteMethodCallShapes ?? new Map()).entries()]
      .map(([key, shapes]) => [key, new Set(shapes)]),
  );
  for (const projection of projections) {
    if (
      projection.source.sourceProjection === "extension-method" ||
      projection.declaration.kind !== "method"
    ) {
      continue;
    }
    const memberKey = providerMemberInheritanceKey(projection.declaration);
    if (memberKey === undefined) {
      continue;
    }
    const callShapes = concreteMethodCallShapes.get(memberKey) ?? new Set<string>();
    for (const signature of projection.declaration.signatures ?? []) {
      callShapes.add(providerSignatureCallShapeKey(signature));
    }
    concreteMethodCallShapes.set(memberKey, callShapes);
  }
  return projections
    .filter((projection) =>
      projection.source.sourceProjection !== "extension-method" ||
      !concreteNonMethodIdentities.has(projection.declaration.id))
    .map((projection) => {
      if (
        projection.source.sourceProjection !== "extension-method" ||
        projection.declaration.kind !== "method"
      ) {
        return projection;
      }
      const memberKey = providerMemberInheritanceKey(projection.declaration);
      const concreteCallShapes = memberKey === undefined
        ? undefined
        : concreteMethodCallShapes.get(memberKey);
      if (concreteCallShapes === undefined) {
        return projection;
      }
      const signatures = (projection.declaration.signatures ?? []).filter((signature) =>
        !concreteCallShapes.has(providerSignatureCallShapeKey(signature)));
      return signatures.length === 0
        ? undefined
        : {
            ...projection,
            declaration: {
              ...projection.declaration,
              signatures,
            },
          };
    })
    .filter((projection): projection is NonNullable<typeof projection> => projection !== undefined)
    .sort((left, right) =>
      Number(left.source.sourceProjection === "extension-method") -
      Number(right.source.sourceProjection === "extension-method"))
    .map((projection) => projection.declaration);
}

export function providerMemberInheritanceKey(
  member: ProviderMemberDeclaration,
): string | undefined {
  if (member.static === true || member.kind === "constructor") {
    return undefined;
  }
  return `${member.kind}:${JSON.stringify(member.name)}`;
}

export function filterTsCompatibleProviderMembers(
  members: readonly ProviderMemberDeclaration[],
): readonly ProviderMemberDeclaration[] {
  const hasNamedMembers = members.some((member) => member.kind !== "indexer");
  if (!hasNamedMembers) {
    return members;
  }
  return members.filter((member) => !isStringIndexerProviderMember(member));
}

const reservedProviderConstructorSourceNames = new Set(["constructor"]);

function mergeProviderMemberWithLocalBase(
  member: ProviderMemberDeclaration,
  baseMembers: readonly ProviderMemberDeclaration[],
): readonly ProviderMemberDeclaration[] {
  const matchingBaseMembers = baseMembers.filter((baseMember) =>
    providerMemberNamesEqual(baseMember, member) &&
    providerMembersHaveSameStaticness(baseMember, member)
  );
  if (matchingBaseMembers.length === 0) {
    return [member];
  }
  if (member.kind === "method" && matchingBaseMembers.every((baseMember) => baseMember.kind === "method")) {
    return [{
      ...member,
      signatures: mergeProviderSignatures([
        ...(member.signatures ?? []),
        ...matchingBaseMembers.flatMap((baseMember) => baseMember.signatures ?? []),
      ]),
    }];
  }
  return [];
}

function providerMembersHaveSameStaticness(
  left: ProviderMemberDeclaration,
  right: ProviderMemberDeclaration,
): boolean {
  return (left.static === true) === (right.static === true);
}

function providerMemberNamesEqual(
  left: ProviderMemberDeclaration,
  right: ProviderMemberDeclaration,
): boolean {
  return JSON.stringify(left.name) === JSON.stringify(right.name);
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
  const parameter = signature.parameters[0]!;
  const parameterType = tryDotnetTypeRefToProviderType(
    parameter.sourceType ?? parameter.type,
    `${member.targetId}.indexerParameter`,
  );
  return parameterType !== undefined && isProviderTsCompatibleIndexType(parameterType);
}

function isProviderTsCompatibleIndexType(type: ReturnType<typeof tryDotnetTypeRefToProviderType>): boolean {
  return isProviderNumberIndexType(type) || type?.kind === "string";
}

function isStringIndexerProviderMember(member: ProviderMemberDeclaration): boolean {
  if (member.kind !== "indexer") {
    return false;
  }
  const parameterType = member.signatures?.[0]?.parameters[0]?.type;
  return parameterType?.kind === "string";
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
