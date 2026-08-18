import type {
  CsharpCompilationUnit,
  CsharpInterfaceMember,
  CsharpMember,
  CsharpModifier,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../../roslyn/syntax.js";
import type {
  CsharpLanguageDialect,
} from "../../../options/csharp-target-options.js";
import {
  blockRequiresUnsafe,
} from "./unsafe-statements.js";
import {
  interfaceMemberRequiresUnsafe,
  typeDeclarationHeaderRequiresUnsafe,
  typeMemberRequiresUnsafe,
} from "./unsafe-members.js";

export function applyCsharpLanguageRequiredUnsafeContexts(
  unit: CsharpCompilationUnit,
  dialect: CsharpLanguageDialect,
): CsharpCompilationUnit {
  if (dialect !== "csharp14") {
    return unit;
  }
  return {
    ...unit,
    members: unit.members.map(applyMemberUnsafeContexts),
  };
}

function applyMemberUnsafeContexts(member: CsharpMember): CsharpMember {
  if (member.kind === "NamespaceDeclaration") {
    return {
      ...member,
      members: member.members.map(applyTypeDeclarationUnsafeContexts),
    };
  }
  return applyTypeDeclarationUnsafeContexts(member);
}

function applyTypeDeclarationUnsafeContexts(
  declaration: CsharpTypeDeclaration,
): CsharpTypeDeclaration {
  if (declaration.kind === "EnumDeclaration") {
    return declaration;
  }
  const modifiers = typeDeclarationHeaderRequiresUnsafe(declaration)
    ? withUnsafeModifier(declaration.modifiers)
    : declaration.modifiers;
  if (declaration.kind === "InterfaceDeclaration") {
    return {
      ...declaration,
      modifiers,
      members: declaration.members.map(applyInterfaceMemberUnsafeContext),
    };
  }
  return {
    ...declaration,
    modifiers,
    members: declaration.members.map(applyTypeMemberUnsafeContext),
  };
}

function applyTypeMemberUnsafeContext(
  member: CsharpTypeMember,
): CsharpTypeMember {
  if (member.kind === "StaticConstructorDeclaration") {
    return !blockRequiresUnsafe(member.body)
      ? member
      : {
          ...member,
          body: {
            kind: "Block",
            statements: [{ kind: "UnsafeStatement", body: member.body }],
          },
        };
  }
  return !typeMemberRequiresUnsafe(member)
    ? member
    : {
        ...member,
        modifiers: withUnsafeModifier(member.modifiers),
      };
}

function applyInterfaceMemberUnsafeContext(
  member: CsharpInterfaceMember,
): CsharpInterfaceMember {
  return !interfaceMemberRequiresUnsafe(member)
    ? member
    : {
        ...member,
        modifiers: withUnsafeModifier(member.modifiers ?? []),
      };
}

function withUnsafeModifier(
  modifiers: readonly CsharpModifier[],
): readonly CsharpModifier[] {
  return modifiers.includes("unsafe")
    ? modifiers
    : [...modifiers, "unsafe"];
}
