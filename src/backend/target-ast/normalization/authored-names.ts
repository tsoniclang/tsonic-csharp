import type { CsharpCompilationUnit } from "../roslyn/index.js";
import { transformCsharpTargetAst } from "./transformation.js";

export function preserveCsharpAuthoredNames(unit: CsharpCompilationUnit): CsharpCompilationUnit {
  return transformCsharpTargetAst(unit, (record, ancestors) => {
    if (record.kind !== "MethodDeclaration" && record.kind !== "LocalFunctionStatement") return record;
    const enclosingNames = new Set(ancestors.filter(ancestor => ["ClassDeclaration", "StructDeclaration",
      "InterfaceDeclaration", "MethodDeclaration", "LocalFunctionStatement"].includes(String(ancestor.kind)))
      .flatMap(typeParameterNames));
    const { shadowsEnclosingTypeParameter, ...rest } = record;
    return { ...rest, ...(typeParameterNames(record).some(name => enclosingNames.has(name))
      ? { shadowsEnclosingTypeParameter: true } : {}) };
  });
}

function typeParameterNames(record: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(record.typeParameters)) return [];
  return record.typeParameters.map(parameter => identifierName((parameter as { readonly name: string }).name));
}

function identifierName(name: string): string {
  return name.startsWith("@") ? name.slice(1) : name;
}
