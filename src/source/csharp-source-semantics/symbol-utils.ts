import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Symbol,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  isTypeSyntaxNode,
} from "./ast-utils.js";

export function getDeclarationTypeNode(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const checker = context.compiler?.checker;
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (checker === undefined || ast === undefined || node === undefined) {
    return undefined;
  }
  if (isTypeSyntaxNode(ast, node)) {
    return node;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, sourceFile);
  const aliasedSymbol = getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
  const declarations = [
    ...getSymbolDeclarations(symbol),
    ...getSymbolDeclarations(aliasedSymbol),
  ];
  for (const declaration of declarations) {
    const type = asNodeSubject(getNodeField(declaration, "Type") ?? getNodeField(declaration, "type"));
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

export function getSymbolForDeclarationLookup(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"],
  node: Node,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Symbol | undefined {
  if (!isSymbolLookupNode(ast, node)) {
    return undefined;
  }
  return checker.getSymbolAtLocation(node, { sourceFile }) ??
    checker.getResolvedSymbol(node, { sourceFile });
}

export function getAliasedSymbolIfAvailable(
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"],
  symbol: ExtensionFactSubject | undefined,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Symbol | undefined {
  if (symbol === undefined) {
    return undefined;
  }
  return checker.getAliasedSymbol(symbol as Symbol, { sourceFile });
}

export function getSymbolDeclarations(symbol: ExtensionFactSubject | undefined): readonly Node[] {
  const symbolWithDeclarations = symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined;
  if (symbolWithDeclarations?.Declarations !== undefined) {
    return symbolWithDeclarations.Declarations;
  }
  return symbolWithDeclarations?.ValueDeclaration === undefined ? [] : [symbolWithDeclarations.ValueDeclaration];
}

function isSymbolLookupNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsQualifiedName(node) ||
    ast.is.IsTypeReferenceNode(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node) ||
    ast.is.IsVariableDeclaration(node) ||
    ast.is.IsParameterDeclaration(node) ||
    ast.is.IsBindingElement(node) ||
    ast.is.IsFunctionDeclaration(node) ||
    ast.is.IsClassDeclaration(node) ||
    ast.is.IsMethodDeclaration(node) ||
    ast.is.IsPropertyDeclaration(node);
}
