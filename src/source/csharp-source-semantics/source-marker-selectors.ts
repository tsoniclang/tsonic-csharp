import {
  attributeFactKey,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
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
  csharpLangModule,
} from "./identity.js";

type SelectorObservationContext = Pick<ExtensionObservationContext, "compiler" | "facts" | "factResolver">;

const attributeBuilderChainMethods = new Set([
  "add",
  "constructor",
  "method",
  "parameter",
  "property",
  "target",
]);

export function isAttributeSelectorApplicationTarget(
  subject: unknown,
  context: SelectorObservationContext,
): boolean {
  const expression = asNodeSubject(subject);
  if (expression === undefined) {
    return false;
  }
  return isAttributeSelectorBodyExpression(expression, context);
}

export function isAttributeSelectorBodyExpression(
  subject: unknown,
  context: SelectorObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const expression = asNodeSubject(subject);
  if (ast === undefined || expression === undefined) {
    return false;
  }
  const arrowFunction = findParentMatching(expression, (node) => ast.is.IsArrowFunction(node));
  return arrowFunction !== undefined &&
    asNodeSubject(getNodeField(arrowFunction, "Body")) === expression &&
    isAttributeSelectorCallbackExpression(arrowFunction, context);
}

export function isAttributeBuilderMemberAccess(
  subject: unknown,
  context: SelectorObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const expression = asNodeSubject(subject);
  if (ast === undefined || expression === undefined || !ast.is.IsPropertyAccessExpression(expression)) {
    return false;
  }
  const parent = asNodeSubject(getNodeField(expression, "Parent"));
  if (parent === undefined || !ast.is.IsCallExpression(parent) || asNodeSubject(getNodeField(parent, "Expression")) !== expression) {
    return false;
  }
  if (isAttributeBuilderProviderMemberAccess(expression, context)) {
    return true;
  }
  const receiver = asNodeSubject(getNodeField(expression, "Expression"));
  if (receiver !== undefined && isAttributeBuilderProviderType(receiver, context)) {
    return true;
  }
  return context.facts.get(parent, attributeFactKey) !== undefined ||
    isAttributeBuilderExpression(parent, context);
}

export function isAttributeSelectorCallbackExpression(
  subject: unknown,
  context: SelectorObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const arrowFunction = asNodeSubject(subject);
  if (ast === undefined || arrowFunction === undefined || !ast.is.IsArrowFunction(arrowFunction)) {
    return false;
  }
  const selectorCall = findParentMatching(arrowFunction, (node) =>
    ast.is.IsCallExpression(node) && getNodeList(getNodeField(node, "Arguments")).includes(arrowFunction)
  );
  if (selectorCall === undefined) {
    return false;
  }
  const selectorCallee = asNodeSubject(getNodeField(selectorCall, "Expression"));
  if (selectorCallee === undefined || !ast.is.IsPropertyAccessExpression(selectorCallee)) {
    return false;
  }
  const selectorDeclaration = attributeBuilderProviderMemberDeclaration(selectorCallee, context);
  const selectorName = selectorDeclaration?.memberName ?? ast.text(ast.name(selectorCallee));
  if (selectorName !== "property" && selectorName !== "method") {
    return false;
  }
  return selectorDeclaration !== undefined ||
    isAttributeBuilderExpression(asNodeSubject(getNodeField(selectorCallee, "Expression")), context);
}

function isAttributeBuilderExpression(
  subject: unknown,
  context: SelectorObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const expression = asNodeSubject(subject);
  if (ast === undefined || expression === undefined) {
    return false;
  }
  if (context.facts.get(expression, attributeFactKey) !== undefined) {
    return true;
  }
  if (!ast.is.IsCallExpression(expression)) {
    return false;
  }
  if (isAttributeBuilderProviderType(expression, context)) {
    return true;
  }
  if (isAttributeMarkerCallExpression(expression, context)) {
    return true;
  }
  const callee = asNodeSubject(getNodeField(expression, "Expression"));
  if (callee === undefined || !ast.is.IsPropertyAccessExpression(callee)) {
    return false;
  }
  const builderMethodName = ast.text(ast.name(callee));
  if (builderMethodName !== "property" && builderMethodName !== "method" && builderMethodName !== "constructor" && builderMethodName !== "parameter" && builderMethodName !== "target") {
    return false;
  }
  return isAttributeBuilderExpression(asNodeSubject(getNodeField(callee, "Expression")), context);
}

function isAttributeMarkerCallExpression(
  expression: NonNullable<ReturnType<typeof asNodeSubject>>,
  context: SelectorObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined || !ast.is.IsCallExpression(expression)) {
    return false;
  }
  const callee = asNodeSubject(getNodeField(expression, "Expression"));
  const calleeName = callee === undefined ? undefined : ast.name(callee);
  for (const subject of [
    expression,
    callee,
    calleeName,
    ...checkerSymbolsForProviderLookup([callee, calleeName], context),
  ]) {
    const declaration = providerVirtualDeclaration(subject, context);
    if (declaration !== undefined && isAttributeSourceMarkerDeclaration(declaration)) {
      return true;
    }
  }
  return false;
}

function isAttributeBuilderProviderMemberAccess(
  expression: NonNullable<ReturnType<typeof asNodeSubject>>,
  context: SelectorObservationContext,
): boolean {
  return attributeBuilderProviderMemberDeclaration(expression, context) !== undefined;
}

function isAttributeBuilderProviderType(
  expression: NonNullable<ReturnType<typeof asNodeSubject>>,
  context: SelectorObservationContext,
): boolean {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return false;
  }
  const sourceFile = compiler.ast.getSourceFile(expression);
  const type = compiler.checker.getTypeAtLocation(expression, { sourceFile });
  const symbol = compiler.checker.getTypeSymbol(type);
  const declaration = providerVirtualDeclaration(symbol, context);
  return declaration !== undefined && isAttributeBuilderDeclaration(declaration);
}

function attributeBuilderProviderMemberDeclaration(
  expression: NonNullable<ReturnType<typeof asNodeSubject>>,
  context: SelectorObservationContext,
): ProviderVirtualDeclarationFact | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || !ast.is.IsPropertyAccessExpression(expression)) {
    return undefined;
  }
  const name = ast.name(expression);
  for (const subject of [
    expression,
    name,
    ...checkerSymbolsForProviderLookup([expression, name], context),
  ]) {
    const declaration = providerVirtualDeclaration(subject, context);
    if (declaration !== undefined && isAttributeBuilderMemberDeclaration(declaration)) {
      return declaration;
    }
  }
  return undefined;
}

function isAttributeBuilderMemberDeclaration(declaration: ProviderVirtualDeclarationFact): boolean {
  return isAttributeBuilderDeclaration(declaration) &&
    declaration.memberName !== undefined &&
    attributeBuilderChainMethods.has(declaration.memberName);
}

function isAttributeBuilderDeclaration(declaration: ProviderVirtualDeclarationFact): boolean {
  return (declaration.moduleSpecifier === tsonicCoreLangModule || declaration.moduleSpecifier === csharpLangModule) &&
    (declaration.exportName === "__TsonicAttributeBuilder" || declaration.exportName === "__TsonicAttributeMemberBuilder");
}

function checkerSymbolsForProviderLookup(
  nodes: readonly unknown[],
  context: SelectorObservationContext,
): readonly ExtensionFactSubject[] {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return [];
  }
  const symbols: ExtensionFactSubject[] = [];
  for (const candidate of nodes) {
    const node = asNodeSubject(candidate);
    if (node === undefined) {
      continue;
    }
    const sourceFile = compiler.ast.getSourceFile(node);
    const symbol = compiler.checker.getSymbolAtLocation(node, { sourceFile });
    const resolved = compiler.checker.getResolvedSymbolOrNil(node, { sourceFile }) ?? undefined;
    if (symbol !== undefined) {
      symbols.push(symbol);
    }
    if (resolved !== undefined && resolved !== symbol) {
      symbols.push(resolved);
    }
  }
  return symbols;
}

function providerVirtualDeclaration(
  subject: unknown,
  context: SelectorObservationContext,
): ProviderVirtualDeclarationFact | undefined {
  const factSubject = asNodeSubject(subject) ?? subject;
  if (factSubject === undefined || factSubject === null || typeof factSubject !== "object") {
    return undefined;
  }
  return context.facts.get(factSubject as ExtensionFactSubject, providerVirtualDeclarationFactKey) ??
    context.factResolver.resolve(factSubject as ExtensionFactSubject, providerVirtualDeclarationFactKey);
}

function isAttributeSourceMarkerDeclaration(declaration: ProviderVirtualDeclarationFact): boolean {
  return (declaration.moduleSpecifier === tsonicCoreLangModule || declaration.moduleSpecifier === csharpLangModule) &&
    declaration.exportName === "attribute";
}

function findParentMatching(
  node: unknown,
  predicate: (candidate: NonNullable<ReturnType<typeof asNodeSubject>>) => boolean,
): ReturnType<typeof asNodeSubject> {
  for (
    let current = asNodeSubject(getNodeField(asNodeSubject(node), "Parent"));
    current !== undefined;
    current = asNodeSubject(getNodeField(current, "Parent"))
  ) {
    if (predicate(current)) {
      return current;
    }
  }
  return undefined;
}
