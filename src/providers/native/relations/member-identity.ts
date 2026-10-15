import type {
  DotnetMemberDeclaration,
  DotnetTypeDeclaration,
} from "../model/index.js";

/**
 * The exact provider member identity for one .NET member.
 *
 * Method ids are disambiguated by staticness because a type may declare a
 * static and an instance member with the same target id. The suffix exists so
 * the provider member id is unique; it is not a semantic encoding. Consumers
 * must compare this identity exactly and read staticness from
 * `ProviderDeclarationIdentity.memberStatic`, never by parsing the spelling.
 *
 * Provider declaration production and target-member conversion both call this
 * function so the two sides carry one identity rather than a relation that has
 * to be reconstructed downstream.
 */
export function dotnetProviderMemberId(member: DotnetMemberDeclaration): string {
  if (member.kind === "constructor") {
    return dotnetMetadataNameWithoutSignature(member.targetId);
  }
  if (member.kind === "method") {
    return `${member.targetId}#${member.static === true ? "static" : "instance"}`;
  }
  return member.targetId;
}

/**
 * The source-visible provider member-group identity within one declaring type.
 *
 * One source member can combine several CLR methods, including projected
 * extension methods, while their signatures retain separate exact identities.
 * This identity therefore follows the source surface rather than any one CLR
 * member.
 */
export function dotnetProviderSourceMemberGroupId(
  member: DotnetMemberDeclaration,
  declaringType: DotnetTypeDeclaration,
): string {
  switch (member.kind) {
    case "constructor":
      return `${declaringType.targetId}#source-constructor`;
    case "indexer":
      return `${declaringType.targetId}#source-indexer`;
    case "method":
    case "property":
    case "field":
    case "event":
    case "operator":
      return [
        declaringType.targetId,
        "source-member",
        (member.sourceStatic ?? member.static) === true
          ? "static"
          : "instance",
        encodeURIComponent(member.sourceName),
      ].join("#");
  }
}

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
}
