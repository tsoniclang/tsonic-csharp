import type {
  ProviderMemberDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetMemberDeclaration,
  DotnetTypeDeclaration,
} from "../model.js";
import { tryDotnetTypeRefToProviderType } from "../model.js";
import { dotnetMemberKindToProviderKind } from "./conversions.js";
import {
  dotnetSignatureToProviderSignature,
  mergeProviderSignatures,
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

export function mergeProviderMemberList(members: readonly ProviderMemberDeclaration[]): readonly ProviderMemberDeclaration[] {
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

export function dotnetMemberToProviderMember(
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
    .filter((signature): signature is NonNullable<typeof signature> => signature !== undefined);
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

function dotnetProviderMemberId(member: DotnetMemberDeclaration): string {
  return member.kind === "constructor"
    ? dotnetMetadataNameWithoutSignature(member.targetId)
    : member.targetId;
}

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
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
