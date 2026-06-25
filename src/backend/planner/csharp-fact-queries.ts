import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import { csharpObjectShapeFactKey } from "../../source/csharp-facts.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
import { IsTypeSyntaxNode } from "./source-ast.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  if (node === undefined) {
    return undefined;
  }
  const typeReference = getCsharpObjectShapeFactForTypeReferenceName(node, sourceFile, input);
  if (typeReference !== undefined) {
    return typeReference;
  }
  const direct = input.facts.getFact(node, csharpObjectShapeFactKey);
  if (direct !== undefined) {
    return direct;
  }
  const declarationAnnotation = getCsharpObjectShapeFactForDeclarationAnnotation(node, sourceFile, input);
  if (declarationAnnotation !== undefined) {
    return declarationAnnotation;
  }
  const semanticType = IsTypeSyntaxNode(input.ast, node)
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
  return input.facts.getFact(semanticType, csharpObjectShapeFactKey) ??
    input.facts.getFact(semanticType?.symbol, csharpObjectShapeFactKey);
}

function getCsharpObjectShapeFactForDeclarationAnnotation(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  const symbol = input.semantics.getSymbolAtLocation(node, { sourceFile });
  const declarations = (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
  for (const declaration of declarations) {
    const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
    const fact = input.facts.getFact(typeNode, csharpObjectShapeFactKey);
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

function getCsharpObjectShapeFactForTypeReferenceName(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  if (input.ast.kindName(node) !== "KindTypeReference") {
    return undefined;
  }
  const typeName = asNodeSubject(getNodeField(node, "TypeName"));
  if (typeName === undefined) {
    return undefined;
  }
  return input.facts.getFact(typeName, csharpObjectShapeFactKey) ??
    input.facts.getFact(input.semantics.getSymbolAtLocation(typeName, { sourceFile }), csharpObjectShapeFactKey) ??
    input.facts.getFact(input.semantics.getResolvedSymbol(typeName, { sourceFile }), csharpObjectShapeFactKey);
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(node, field)?.value;
}
