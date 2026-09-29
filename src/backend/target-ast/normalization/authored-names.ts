import type { CsharpCompilationUnit, CsharpInterfaceMethodDeclaration, CsharpMethodDeclaration,
  CsharpTypeDeclaration } from "../roslyn/index.js";

export function preserveCsharpAuthoredNames(unit: CsharpCompilationUnit): CsharpCompilationUnit {
  return { ...unit, members: unit.members.map(member => member.kind === "NamespaceDeclaration"
    ? { ...member, members: member.members.map(preserveTypeNames) } : preserveTypeNames(member)) };
}

function preserveTypeNames(declaration: CsharpTypeDeclaration): CsharpTypeDeclaration {
  if (declaration.kind === "EnumDeclaration") return declaration;
  const enclosingNames = new Set(declaration.typeParameters?.map(parameter => identifierName(parameter.name)));
  const preserveMethod = <Method extends CsharpMethodDeclaration | CsharpInterfaceMethodDeclaration>(method: Method): Method => {
    const { shadowsEnclosingTypeParameter, ...rest } = method;
    return { ...rest, ...(method.typeParameters?.some(parameter => enclosingNames.has(identifierName(parameter.name)))
      ? { shadowsEnclosingTypeParameter: true as const } : {}) } as Method;
  };
  if (declaration.kind === "InterfaceDeclaration") return { ...declaration, members: declaration.members.map(member =>
    member.kind === "MethodDeclaration" ? preserveMethod(member) : member) };
  return { ...declaration, members: declaration.members.map(member =>
    member.kind === "MethodDeclaration" ? preserveMethod(member) : member) };
}

function identifierName(name: string): string {
  return name.startsWith("@") ? name.slice(1) : name;
}
