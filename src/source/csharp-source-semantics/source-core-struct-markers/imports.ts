import type {
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
} from "../ast-utils.js";
import {
  getSafeResolvedSymbol,
  getSafeSymbol,
} from "./symbols.js";

export function getSourceCoreLangStructImportSymbols(
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

export function getSourceCoreLangNamespaceImportSymbols(
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
