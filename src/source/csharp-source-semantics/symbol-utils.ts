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
  return checker.getResolvedSymbol(node, { sourceFile });
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
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"],
  symbol: ExtensionFactSubject | undefined,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Symbol | undefined {
  if (!isTstsSymbolSubject(symbol)) {
    return undefined;
  }
  if (!checker.getSymbolDeclarations(symbol).some((declaration) => isAliasDeclaration(ast, declaration))) {
    return undefined;
  }
  return checker.getAliasedSymbol(symbol, { sourceFile });
}

function isAliasDeclaration(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  declaration: Node | undefined,
): boolean {
  let current = declaration;
  for (let depth = 0; current !== undefined && depth < 3; depth += 1) {
    if (
      ast.is.IsImportClause(current) ||
      ast.is.IsImportSpecifier(current) ||
      ast.is.IsNamespaceImport(current) ||
      ast.is.IsExportSpecifier(current)
    ) {
      return true;
    }
    current = ast.parent(current);
  }
  return false;
}

export function getSymbolDeclarations(
  symbol: ExtensionFactSubject | undefined,
  checker: Pick<TypeCheckerQueries, "getSymbolDeclarations"> | undefined,
): readonly Node[] {
  if (!isTstsSymbolSubject(symbol) || checker === undefined) {
    return [];
  }
  return checker.getSymbolDeclarations(symbol).filter((declaration): declaration is Node => declaration !== undefined);
}

export function isTstsSymbolSubject(subject: ExtensionFactSubject | undefined): subject is Symbol {
  const candidate = subject as {
    readonly Flags?: unknown;
    readonly Name?: unknown;
    readonly Kind?: unknown;
    readonly data?: unknown;
  } | undefined;
  return candidate !== undefined &&
    typeof candidate === "object" &&
    typeof candidate.Flags === "number" &&
    typeof candidate.Name === "string" &&
    candidate.Kind === undefined &&
    candidate.data === undefined;
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
    ast.is.IsQualifiedName(node);
}
