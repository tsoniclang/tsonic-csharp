import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolForDeclarationLookup,
  getSymbolDeclarations,
} from "../symbol-utils.js";
import {
  isSourceCoreStructMarkerCallExpression,
} from "./call-expression.js";
import {
  getSourceCoreResolvedSymbol,
  getSourceCoreSymbolAtLocation,
} from "./symbols.js";

export function getSourceCoreStructMarkerDeclarationFromSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  const kind = compiler.ast.kindName(node);
  if (isTypeReferenceNamePosition(node, context)) {
    return undefined;
  }
  if (kind === "KindTypeReference") {
    const type = compiler.checker.getTypeFromTypeNode(node, { sourceFile: compiler.ast.getSourceFile(node) });
    const aliasSymbol = compiler.checker.getTypeAliasSymbol(type);
    const typeSymbol = compiler.checker.getTypeSymbol(type);
    return getSourceCoreStructMarkerDeclarationFromSymbol(aliasSymbol ?? typeSymbol, context);
  }
  const referenceName = kind === "KindTypeQuery"
    ? asNodeSubject(getNodeField(node, "ExprName"))
    : node;
  if (referenceName === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(referenceName);
  const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, referenceName, sourceFile);
  const aliasedSymbol = sourceFile === undefined
    ? undefined
    : getAliasedSymbolIfAvailable(compiler.ast, compiler.checker, symbol, sourceFile);
  return getSourceCoreStructMarkerDeclarationFromSymbol(aliasedSymbol ?? symbol, context);
}

export function getSourceCoreStructMarkerDeclarationFromSymbol(
  symbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  for (const declaration of getSymbolDeclarations(symbol, compiler.checker)) {
    const kind = compiler.ast.kindName(declaration);
    if (kind === "KindObjectLiteralExpression" && subjectIsSourceCoreStructDeclarationPayload(declaration, context)) {
      const markerDeclaration = getSourceCoreStructMarkerDeclarationFromPayload(declaration, context);
      if (markerDeclaration !== undefined) {
        return markerDeclaration;
      }
      continue;
    }
    if (kind === "KindVariableDeclaration") {
      const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
      if (initializer !== undefined &&
        compiler.ast.kindName(initializer) === "KindCallExpression" &&
        isSourceCoreStructMarkerCallExpression(initializer, context)) {
        return declaration;
      }
      continue;
    }
    if (kind === "KindTypeAliasDeclaration") {
      const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
      const exprName = typeNode !== undefined && compiler.ast.kindName(typeNode) === "KindTypeQuery"
        ? asNodeSubject(getNodeField(typeNode, "ExprName"))
        : undefined;
      const referenced = exprName === undefined
        ? undefined
        : getSourceCoreSymbolAtLocation(exprName, context) ?? getSourceCoreResolvedSymbol(exprName, context);
      const structDeclaration = getSourceCoreStructMarkerDeclarationFromSymbol(referenced, context);
      if (structDeclaration !== undefined) {
        return structDeclaration;
      }
    }
  }
  return undefined;
}

export function subjectIsSourceCoreStructDeclarationPayload(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined || compiler.ast.kindName(node) !== "KindObjectLiteralExpression") {
    return false;
  }
  for (let current = compiler.ast.parent(node); current !== undefined; current = compiler.ast.parent(current)) {
    const kind = compiler.ast.kindName(current);
    if (kind === "KindCallExpression" && isSourceCoreStructMarkerCallExpression(current, context)) {
      return true;
    }
    if (kind === "KindVariableStatement" || kind === "KindStatementList" || kind === "KindSourceFile") {
      return false;
    }
  }
  return false;
}

export function subjectIsWithinSourceCoreStructMarkerCallExpression(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return false;
  }
  for (let current: Node | undefined = node; current !== undefined; current = compiler.ast.parent(current)) {
    if (compiler.ast.kindName(current) === "KindCallExpression" &&
      isSourceCoreStructMarkerCallExpression(current, context)) {
      return true;
    }
  }
  return false;
}

function isTypeReferenceNamePosition(
  node: Node,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  for (let current: Node | undefined = node; current !== undefined; current = ast.parent(current)) {
    const parent = ast.parent(current);
    if (parent === undefined) {
      return false;
    }
    if (ast.kindName(parent) === "KindTypeReference" && asNodeSubject(getNodeField(parent, "TypeName")) === current) {
      return true;
    }
    if (ast.kindName(parent) !== "KindQualifiedName") {
      return false;
    }
  }
  return false;
}

function getSourceCoreStructMarkerDeclarationFromPayload(
  payload: Node,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  for (let current = compiler.ast.parent(payload); current !== undefined; current = compiler.ast.parent(current)) {
    if (compiler.ast.kindName(current) === "KindCallExpression" && isSourceCoreStructMarkerCallExpression(current, context)) {
      const parent = compiler.ast.parent(current);
      return parent !== undefined &&
        compiler.ast.kindName(parent) === "KindVariableDeclaration" &&
        asNodeSubject(getNodeField(parent, "Initializer")) === current
        ? parent
        : undefined;
    }
    const kind = compiler.ast.kindName(current);
    if (kind === "KindVariableStatement" || kind === "KindStatementList" || kind === "KindSourceFile") {
      return undefined;
    }
  }
  return undefined;
}
