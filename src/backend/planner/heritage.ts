import {
  AsHeritageClause,
  KindExtendsKeyword,
  KindImplementsKeyword,
  SourceTokenKind,
} from "./source-ast.js";
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
  clauses: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassHeritage {
  const interfaces: CsharpTypeNode[] = [];
  let baseType: CsharpTypeNode | undefined;
  for (const node of clauses) {
    if (node === undefined) {
      continue;
    }
    const clause = AsHeritageClause(node)!;
    const types = clause.Types?.Nodes ?? [];
    switch (SourceTokenKind(input.ast, clause.Token)) {
      case KindExtendsKeyword:
        if (types.length > 1) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "Classes can extend only one C# base type."));
        }
        for (const heritageType of types) {
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
        break;
      case KindImplementsKeyword:
        interfaces.push(...planHeritageTypes(types, sourceFile, input, diagnostics));
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(node, "Class heritage clause is outside the current C# planning surface."));
        break;
    }
  }
  return baseType === undefined ? { interfaces } : { baseType, interfaces };
}

export function planInterfaceHeritage(
  clauses: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  const interfaces: CsharpTypeNode[] = [];
  for (const node of clauses) {
    if (node === undefined) {
      continue;
    }
    const clause = AsHeritageClause(node)!;
    switch (SourceTokenKind(input.ast, clause.Token)) {
      case KindExtendsKeyword:
        interfaces.push(...planHeritageTypes(clause.Types?.Nodes ?? [], sourceFile, input, diagnostics));
        break;
      case KindImplementsKeyword:
        diagnostics.push(unsupportedNodeDiagnostic(node, "Interfaces cannot implement types in C#; use extends-compatible interface heritage."));
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(node, "Interface heritage clause is outside the current C# planning surface."));
        break;
    }
  }
  return interfaces;
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
