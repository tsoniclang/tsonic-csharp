import type {
  CsharpCompilationUnit,
  CsharpMember,
  CsharpModifier,
  CsharpTypeDeclaration,
} from "../roslyn/syntax.js";

export function markCompilationUnitUnsafe(unit: CsharpCompilationUnit): CsharpCompilationUnit {
  return {
    ...unit,
    members: unit.members.map(markMemberUnsafe),
  };
}

function markMemberUnsafe(member: CsharpMember): CsharpMember {
  if (member.kind === "NamespaceDeclaration") {
    return {
      ...member,
      members: member.members.map(markTypeDeclarationUnsafe),
    };
  }
  return markTypeDeclarationUnsafe(member);
}

function markTypeDeclarationUnsafe(declaration: CsharpTypeDeclaration): CsharpTypeDeclaration {
  if (declaration.kind === "EnumDeclaration") {
    return declaration;
  }
  return {
    ...declaration,
    modifiers: withUnsafeModifier(declaration.modifiers),
  };
}

function withUnsafeModifier(modifiers: readonly CsharpModifier[]): readonly CsharpModifier[] {
  if (modifiers.includes("unsafe")) {
    return modifiers;
  }
  const access = modifiers.filter((modifier) => modifier === "public" || modifier === "internal" || modifier === "private");
  const rest = modifiers.filter((modifier) => modifier !== "public" && modifier !== "internal" && modifier !== "private");
  return [...access, "unsafe", ...rest];
}
