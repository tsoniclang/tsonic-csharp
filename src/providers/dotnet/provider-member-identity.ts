import type {
  DotnetMemberDeclaration,
} from "./model.js";

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

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
}
