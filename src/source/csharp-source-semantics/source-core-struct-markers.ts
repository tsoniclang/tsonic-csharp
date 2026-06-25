import {
  canonicalIdentityFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Symbol,
} from "@tsonic/tsts";
import {
  tsonicCoreLangModule,
} from "@tsonic/source-core";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolDeclarations,
} from "./symbol-utils.js";

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
    try {
      const type = compiler.checker.getTypeFromTypeNode(node, { sourceFile: compiler.ast.getSourceFile(node) });
      const aliasSymbol = (type as { readonly aliasSymbol?: Symbol | undefined } | undefined)?.aliasSymbol;
      return getSourceCoreStructMarkerDeclarationFromSymbol(aliasSymbol ?? type?.symbol, context);
    } catch {
      return undefined;
    }
  }
  const referenceName = kind === "KindTypeQuery"
    ? asNodeSubject(getNodeField(node, "ExprName"))
    : node;
  if (referenceName === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(referenceName);
  const symbol = getSafeSymbol(referenceName, context) ?? getSafeResolvedSymbol(referenceName, context);
  const aliasedSymbol = sourceFile === undefined
    ? undefined
    : getAliasedSymbolIfAvailable(compiler.checker, symbol, sourceFile);
  return getSourceCoreStructMarkerDeclarationFromSymbol(aliasedSymbol ?? symbol, context);
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

export function getSourceCoreStructMarkerDeclarationFromSymbol(
  symbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  for (const declaration of getSymbolDeclarations(symbol)) {
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
        : getSafeSymbol(exprName, context) ?? getSafeResolvedSymbol(exprName, context);
      const structDeclaration = getSourceCoreStructMarkerDeclarationFromSymbol(referenced, context);
      if (structDeclaration !== undefined) {
        return structDeclaration;
      }
    }
  }
  return undefined;
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

export function isSourceCoreStructMarkerCallExpression(
  callExpression: Node,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const expression = asNodeSubject(getNodeField(callExpression, "Expression"));
  if (compiler === undefined || expression === undefined) {
    return false;
  }
  if (compiler.ast.kindName(expression) === "KindPropertyAccessExpression") {
    const propertyName = asNodeSubject(getNodeField(expression, "Name"));
    const receiver = asNodeSubject(getNodeField(expression, "Expression"));
    if (propertyName === undefined || receiver === undefined || compiler.ast.text(propertyName) !== "struct") {
      return false;
    }
    const receiverIdentity = getCanonicalIdentityForNode(receiver, context);
    return receiverIdentity?.kind === "module" && receiverIdentity.id === tsonicCoreLangModule;
  }
  const identity = getCanonicalIdentityForNode(expression, context);
  if (identity?.kind === "export" &&
    identity.id === `${tsonicCoreLangModule}::struct` &&
    identity.exportName === "struct") {
    return true;
  }
  return isSourceCoreStructMarkerCallExpressionFromImportSymbols(callExpression, context);
}

function getCanonicalIdentityForNode(
  node: Node,
  context: ExtensionObservationContext,
) {
  const direct = context.facts.get(node, canonicalIdentityFactKey);
  if (direct !== undefined) {
    return direct;
  }
  const symbol = getSafeSymbol(node, context);
  const resolved = getSafeResolvedSymbol(node, context);
  return context.facts.get(symbol, canonicalIdentityFactKey) ??
    context.facts.get(resolved, canonicalIdentityFactKey);
}

function isSourceCoreStructMarkerCallExpressionFromImportSymbols(
  callExpression: Node,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const expression = asNodeSubject(getNodeField(callExpression, "Expression"));
  if (compiler === undefined || expression === undefined) {
    return false;
  }
  const sourceFile = compiler.ast.getSourceFile(callExpression);
  if (sourceFile === undefined) {
    return false;
  }
  if (compiler.ast.kindName(expression) === "KindPropertyAccessExpression") {
    const propertyName = asNodeSubject(getNodeField(expression, "Name"));
    const receiver = asNodeSubject(getNodeField(expression, "Expression"));
    if (propertyName === undefined || receiver === undefined || compiler.ast.text(propertyName) !== "struct") {
      return false;
    }
    const receiverSymbol = getSafeSymbol(receiver, context) ?? getSafeResolvedSymbol(receiver, context);
    return receiverSymbol !== undefined && getSourceCoreLangNamespaceImportSymbols(sourceFile, context)
      .some((symbol) => symbol === receiverSymbol);
  }
  const expressionSymbol = getSafeSymbol(expression, context) ?? getSafeResolvedSymbol(expression, context);
  return expressionSymbol !== undefined && getSourceCoreLangStructImportSymbols(sourceFile, context)
    .some((symbol) => symbol === expressionSymbol);
}

function getSourceCoreLangStructImportSymbols(
  sourceFile: Node,
  context: ExtensionObservationContext,
): readonly Symbol[] {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return [];
  }
  const symbols: Symbol[] = [];
  for (const importDeclaration of getSourceCoreLangImportDeclarations(sourceFile, context)) {
    const namedBindings = getImportNamedBindings(importDeclaration);
    if (namedBindings === undefined || compiler.ast.kindName(namedBindings) !== "KindNamedImports") {
      continue;
    }
    for (const importSpecifier of getNodeList(getNodeField(namedBindings, "Elements"))) {
      const localName = asNodeSubject(getNodeField(importSpecifier, "name"));
      const exportedName = asNodeSubject(getNodeField(importSpecifier, "PropertyName")) ?? localName;
      if (localName !== undefined && exportedName !== undefined && compiler.ast.text(exportedName) === "struct") {
        const symbol = getSafeSymbol(localName, context) ?? getSafeResolvedSymbol(localName, context);
        if (symbol !== undefined) {
          symbols.push(symbol);
        }
      }
    }
  }
  return symbols;
}

function getSourceCoreLangNamespaceImportSymbols(
  sourceFile: Node,
  context: ExtensionObservationContext,
): readonly Symbol[] {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return [];
  }
  const symbols: Symbol[] = [];
  for (const importDeclaration of getSourceCoreLangImportDeclarations(sourceFile, context)) {
    const namedBindings = getImportNamedBindings(importDeclaration);
    if (namedBindings === undefined || compiler.ast.kindName(namedBindings) !== "KindNamespaceImport") {
      continue;
    }
    const name = asNodeSubject(getNodeField(namedBindings, "name"));
    if (name === undefined) {
      continue;
    }
    const symbol = getSafeSymbol(name, context) ?? getSafeResolvedSymbol(name, context);
    if (symbol !== undefined) {
      symbols.push(symbol);
    }
  }
  return symbols;
}

function getSourceCoreLangImportDeclarations(
  sourceFile: Node,
  context: ExtensionObservationContext,
): readonly Node[] {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return [];
  }
  return getNodeList(getNodeField(sourceFile, "Statements")).filter((statement) => {
    if (compiler.ast.kindName(statement) !== "KindImportDeclaration") {
      return false;
    }
    const moduleSpecifier = asNodeSubject(getNodeField(statement, "ModuleSpecifier"));
    return moduleSpecifier !== undefined && compiler.ast.text(moduleSpecifier) === tsonicCoreLangModule;
  });
}

function getImportNamedBindings(importDeclaration: Node): Node | undefined {
  const importClause = asNodeSubject(getNodeField(importDeclaration, "ImportClause"));
  return asNodeSubject(getNodeField(importClause, "NamedBindings"));
}

function getSafeSymbol(
  node: Node,
  context: ExtensionObservationContext,
) {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  try {
    return compiler.checker.getSymbolAtLocation(node, { sourceFile: compiler.ast.getSourceFile(node) });
  } catch {
    return undefined;
  }
}

function getSafeResolvedSymbol(
  node: Node,
  context: ExtensionObservationContext,
) {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  try {
    return compiler.checker.getResolvedSymbol(node, { sourceFile: compiler.ast.getSourceFile(node) });
  } catch {
    return undefined;
  }
}
