import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Symbol,
  TypeCheckerQueries,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  isControlFlowLabelIdentifier,
  isTypeSyntaxNode,
} from "./ast-utils.js";

const symbolFlagsAlias = 1 << 21;

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
  const directType = asNodeSubject(getNodeField(node, "Type"));
  if (directType !== undefined) {
    return directType;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, sourceFile);
  for (const declaration of getSymbolDeclarations(symbol, checker)) {
    const type = asNodeSubject(getNodeField(declaration, "Type"));
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
  if (!isSymbolLookupNode(ast, node) || isTypeOnlySymbolLookupPosition(ast, node)) {
    return undefined;
  }
  if (isControlFlowLabelIdentifier(ast, node) || isPropertyAccessName(ast, node)) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(node, { sourceFile });
  if (symbol !== undefined || !isResolvedSymbolLookupNode(ast, node)) {
    return symbol;
  }
  try {
    return checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function isPropertyAccessName(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.is.IsPropertyAccessExpression(parent) &&
    ast.name(parent) === node;
}

function isTypeOnlySymbolLookupPosition(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  if (isTypeSyntaxNode(ast, node)) {
    return true;
  }
  let current: Node | undefined = node;
  for (let parent = asNodeSubject(getNodeField(current, "Parent")); parent !== undefined; parent = asNodeSubject(getNodeField(parent, "Parent"))) {
    if (ast.is.IsTypeReferenceNode(parent) ||
      ast.is.IsTypeParameterDeclaration(parent) ||
      ast.is.IsTypeAliasDeclaration(parent) ||
      ast.is.IsInterfaceDeclaration(parent) ||
      ast.is.IsImportTypeNode(parent)) {
      return true;
    }
    if (!ast.is.IsQualifiedName(parent)) {
      return false;
    }
    current = parent;
  }
  return false;
}

export function getAliasedSymbolIfAvailable(
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"],
  symbol: ExtensionFactSubject | undefined,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Symbol | undefined {
  if (symbol === undefined) {
    return undefined;
  }
  const candidate = symbol as Symbol;
  if ((candidate.Flags & symbolFlagsAlias) === 0) {
    return undefined;
  }
  try {
    return checker.getAliasedSymbol(candidate, { sourceFile });
  } catch {
    return undefined;
  }
}

export function getSymbolDeclarations(
  symbol: ExtensionFactSubject | undefined,
  checker: Pick<TypeCheckerQueries, "getSymbolDeclarations"> | undefined,
): readonly Node[] {
  if (symbol === undefined || checker === undefined) {
    return [];
  }
  return checker.getSymbolDeclarations(symbol as Symbol).filter((declaration): declaration is Node => declaration !== undefined);
}

function isSymbolLookupNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsQualifiedName(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsVariableDeclaration(node) ||
    ast.is.IsParameterDeclaration(node) ||
    ast.is.IsBindingElement(node) ||
    ast.is.IsFunctionDeclaration(node) ||
    ast.is.IsClassDeclaration(node) ||
    ast.is.IsMethodDeclaration(node) ||
    ast.is.IsPropertyDeclaration(node);
}

function isResolvedSymbolLookupNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsQualifiedName(node) ||
    ast.is.IsPropertyAccessExpression(node);
}
