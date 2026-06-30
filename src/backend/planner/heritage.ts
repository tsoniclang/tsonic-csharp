import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import { expressionToCsharpType } from "./csharp-types.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

export interface CsharpClassHeritage {
  readonly baseType?: CsharpTypeNode;
  readonly interfaces: readonly CsharpTypeNode[];
}

export function planClassHeritage(
  classDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassHeritage {
  const interfaces: CsharpTypeNode[] = [];
  let baseType: CsharpTypeNode | undefined;
  const baseTypes = input.ast.extendsHeritageElements(classDeclaration);
  if (baseTypes.length > 1) {
    diagnostics.push(unsupportedNodeDiagnostic(classDeclaration, "Classes can extend only one C# base type."));
  }
  for (const heritageType of baseTypes) {
    if (heritageType === undefined) {
      continue;
    }
    const planned = planHeritageType(heritageType, sourceFile, input, diagnostics);
    if (baseType === undefined) {
      baseType = planned;
    } else {
      diagnostics.push(unsupportedNodeDiagnostic(heritageType, "Additional class base types cannot be emitted to C#."));
    }
  }
  interfaces.push(...planHeritageTypes(input.ast.implementsHeritageElements(classDeclaration), sourceFile, input, diagnostics));
  return baseType === undefined ? { interfaces } : { baseType, interfaces };
}

export function planInterfaceHeritage(
  interfaceDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  const implementedTypes = input.ast.implementsHeritageElements(interfaceDeclaration);
  if (implementedTypes.length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(interfaceDeclaration, "Interfaces cannot implement types in C#; use extends-compatible interface heritage."));
  }
  return planHeritageTypes(input.ast.extendsHeritageElements(interfaceDeclaration), sourceFile, input, diagnostics);
}

function planHeritageTypes(
  nodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  return nodes
    .filter((node): node is Node => node !== undefined)
    .map((node) => planHeritageType(node, sourceFile, input, diagnostics));
}

function planHeritageType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode {
  return expressionToCsharpType(node, sourceFile, input, diagnostics);
}
