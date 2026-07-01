import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
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
  const declaredType = asNodeSubject(getNodeField(node, "Type"));
  if (declaredType !== undefined) {
    const declaredTypeFact = getCsharpObjectShapeFactForNode(declaredType, sourceFile, input);
    if (declaredTypeFact !== undefined) {
      return declaredTypeFact;
    }
  }
  const declarationAnnotation = getCsharpObjectShapeFactForDeclarationAnnotation(node, sourceFile, input);
  if (declarationAnnotation !== undefined) {
    return declarationAnnotation;
  }
  const semanticType = IsTypeSyntaxNode(input.ast, node)
    ? input.analysis.getTypeFromTypeNode(node, { sourceFile })
    : input.analysis.getTypeAtLocation(node, { sourceFile });
  const semanticTypeSymbol = input.analysis.getTypeSymbol(semanticType);
  return input.facts.getFact(semanticType, csharpObjectShapeFactKey) ??
    input.facts.getFact(semanticTypeSymbol, csharpObjectShapeFactKey);
}

export function getCsharpObjectShapeFactForTargetType(
  targetType: TargetTypeRef | undefined,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  return targetType === undefined
    ? undefined
    : input.facts.getFact(targetType, csharpObjectShapeFactKey);
}

function getCsharpObjectShapeFactForDeclarationAnnotation(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpObjectShapeFact | undefined {
  const symbol = input.analysis.getSymbolAtLocation(node, { sourceFile });
  const declarations = input.analysis.getSymbolDeclarations(symbol);
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
    input.facts.getFact(input.analysis.getSymbolAtLocation(typeName, { sourceFile }), csharpObjectShapeFactKey) ??
    input.facts.getFact(input.analysis.getResolvedSymbol(typeName, { sourceFile }), csharpObjectShapeFactKey);
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(node, field)?.value;
}
