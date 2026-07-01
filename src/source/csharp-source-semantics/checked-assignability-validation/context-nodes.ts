import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObservedTargetAssignabilityFact,
} from "../../csharp-facts.js";
import {
  getNodeField,
} from "../ast-utils.js";
import {
  asNode,
} from "./subjects.js";

export function resolveObservedAssignabilitySourceNode(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): Node | undefined {
  const ast = context.compiler?.ast;
  const expression = asNode(fact.expression ?? fact.errorNode);
  if (ast === undefined || expression === undefined) {
    return undefined;
  }
  if (ast.is.IsBinaryExpression(expression)) {
    return asNode(getNodeField(expression, "Right"));
  }
  const kind = ast.kindName(expression);
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    return asNode(getNodeField(expression, "Initializer"));
  }
  if (kind === "KindReturnStatement") {
    return asNode(getNodeField(expression, "Expression"));
  }
  return expression;
}

export function resolveObservedAssignabilityTargetNode(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): Node | undefined {
  const ast = context.compiler?.ast;
  const expression = asNode(fact.expression ?? fact.errorNode);
  if (ast === undefined || expression === undefined) {
    return undefined;
  }
  if (ast.is.IsBinaryExpression(expression)) {
    return asNode(getNodeField(expression, "Left"));
  }
  const kind = ast.kindName(expression);
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    return asNode(getNodeField(expression, "Type")) ?? asNode(getNodeField(expression, "name"));
  }
  if (kind === "KindReturnStatement") {
    return getEnclosingReturnTypeNode(expression, context);
  }
  return getObservedAssignabilityContextTargetNode(expression, context);
}

export function getObservedAssignabilitySourceFile(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): SourceFile | undefined {
  const ast = context.compiler?.ast;
  const node = asNode(fact.expression ?? fact.errorNode) ??
    resolveObservedAssignabilitySourceNode(fact, context) ??
    resolveObservedAssignabilityTargetNode(fact, context);
  return ast === undefined || node === undefined ? undefined : ast.getSourceFile(node);
}

export function canUseObservedContextSubject(subject: unknown): boolean {
  if (typeof subject !== "object" || subject === null) {
    return false;
  }
  const nodeKind = (subject as { readonly Kind?: unknown }).Kind;
  return typeof nodeKind === "number" ||
    typeof nodeKind === "string" ||
    "flags" in subject ||
    "symbol" in subject;
}

export function isInferredLocalAssignmentObservation(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): boolean {
  if (fact.relation !== "assignment") {
    return false;
  }
  const ast = context.compiler?.ast;
  const expression = asNode(fact.expression ?? fact.errorNode);
  if (ast === undefined || expression === undefined) {
    return false;
  }
  if (ast.kindName(expression) === "KindVariableDeclaration") {
    return asNode(getNodeField(expression, "Type")) === undefined;
  }
  const parent = ast.parent(expression);
  return parent !== undefined &&
    ast.kindName(parent) === "KindVariableDeclaration" &&
    asNode(getNodeField(parent, "Initializer")) === expression &&
    asNode(getNodeField(parent, "Type")) === undefined;
}

export function getEnclosingReturnTypeNode(
  returnStatement: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): Node | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  let current = ast.parent(returnStatement);
  while (current !== undefined) {
    const kind = ast.kindName(current);
    if (
      kind === "KindFunctionDeclaration" ||
      kind === "KindMethodDeclaration" ||
      kind === "KindFunctionExpression" ||
      kind === "KindArrowFunction" ||
      kind === "KindGetAccessor"
    ) {
      return asNode(getNodeField(current, "Type"));
    }
    current = ast.parent(current);
  }
  return undefined;
}

export function getEnclosingReturnTargetCarrier(
  returnStatement: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  let current = ast.parent(returnStatement);
  while (current !== undefined) {
    const kind = ast.kindName(current);
    if (
      kind === "KindFunctionDeclaration" ||
      kind === "KindMethodDeclaration" ||
      kind === "KindFunctionExpression" ||
      kind === "KindArrowFunction" ||
      kind === "KindGetAccessor"
    ) {
      const typeNode = asNode(getNodeField(current, "Type"));
      return typeNode === undefined
        ? undefined
        : context.facts.get(typeNode, runtimeCarrierFactKey)?.carrier ??
          context.factResolver.resolve(typeNode, runtimeCarrierFactKey)?.carrier;
    }
    current = ast.parent(current);
  }
  return undefined;
}

function getObservedAssignabilityContextTargetNode(
  expression: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): Node | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const parent = ast.parent(expression);
  if (parent === undefined) {
    return undefined;
  }
  if (ast.is.IsBinaryExpression(parent) && asNode(getNodeField(parent, "Right")) === expression) {
    return asNode(getNodeField(parent, "Left"));
  }
  const parentKind = ast.kindName(parent);
  if (
    (parentKind === "KindVariableDeclaration" || parentKind === "KindPropertyDeclaration") &&
    asNode(getNodeField(parent, "Initializer")) === expression
  ) {
    return asNode(getNodeField(parent, "Type")) ?? asNode(getNodeField(parent, "name"));
  }
  if (parentKind === "KindReturnStatement" && asNode(getNodeField(parent, "Expression")) === expression) {
    return getEnclosingReturnTypeNode(parent, context);
  }
  return undefined;
}
