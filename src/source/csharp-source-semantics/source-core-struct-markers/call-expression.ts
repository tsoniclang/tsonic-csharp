import {
  canonicalIdentityFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  tsonicCoreLangModule,
} from "@tsonic/source-core";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  getSourceCoreLangNamespaceImportSymbols,
  getSourceCoreLangStructImportSymbols,
} from "./imports.js";
import {
  getSafeResolvedSymbol,
  getSafeSymbol,
} from "./symbols.js";

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
