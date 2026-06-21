import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
import {
  IsTypeSyntaxNode,
} from "./source-ast.js";

export function getTypeParameterName(input: TargetCompileInput, type: Type): string | undefined {
  const declarations = (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ?? [];
  for (const declaration of declarations) {
    if (!input.ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const name = (declaration as { readonly name?: { readonly Text?: unknown } }).name;
    const text = name?.Text;
    if (typeof text === "string" && text.length > 0) {
      return text;
    }
  }
  return undefined;
}

export function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(node, field)?.value;
}

export function getSemanticTypeForNode(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): Type | undefined {
  return IsTypeSyntaxNode(input.ast, sourceNode)
    ? input.semantics.getTypeFromTypeNode(sourceNode, { sourceFile })
    : input.semantics.getTypeAtLocation(sourceNode, { sourceFile });
}

export function getSymbolDeclarations(symbol: ExtensionFactSubject | undefined): readonly Node[] {
  return (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
}

export function asNode(value: unknown): Node | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly Kind?: unknown }).Kind === "number"
    ? value as Node
    : undefined;
}
