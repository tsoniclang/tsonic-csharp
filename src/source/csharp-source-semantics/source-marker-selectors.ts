import {
  attributeFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "./ast-utils.js";

type SelectorObservationContext = Pick<ExtensionObservationContext, "compiler" | "facts">;

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
  const selectorName = ast.text(ast.name(selectorCallee));
  if (selectorName !== "property" && selectorName !== "method") {
    return false;
  }
  return isAttributeBuilderExpression(asNodeSubject(getNodeField(selectorCallee, "Expression")), context);
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
