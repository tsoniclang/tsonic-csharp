import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
} from "@tsonic/tsts";

export function countProviderVirtualDeclarations(model: ProviderDeclarationModel): number {
  return model.exports.reduce((count, declaration) => count + countProviderExportDeclaration(declaration), 0);
}

function countProviderExportDeclaration(declaration: ProviderExportDeclaration): number {
  return 1
    + (declaration.signatures?.length ?? 0)
    + countProviderMemberDeclarations(declaration.members);
}

function countProviderMemberDeclarations(members: readonly ProviderMemberDeclaration[] | undefined): number {
  return (members ?? []).reduce(
    (count, member) => count + 1 + (member.signatures?.length ?? 0),
    0,
  );
}
