import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  Node,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
} from "../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../operator-syntax.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../target-types.js";

export interface OpaqueAnyOperation {
  readonly kind: string;
  readonly description: string;
}

export function getOpaqueAnyOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): OpaqueAnyOperation | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  if (ast.is.IsCallExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "call", description: "C# call emission" }
      : undefined;
  }
  if (ast.is.IsNewExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "construct", description: "C# construct emission" }
      : undefined;
  }
  if (ast.is.IsPropertyAccessExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "property", description: "C# property access emission" }
      : undefined;
  }
  if (ast.is.IsElementAccessExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "element", description: "C# element access emission" }
      : undefined;
  }
  if (ast.is.IsBinaryExpression(node)) {
    const operator = getBinaryOperatorText(ast, node);
    if (operator === "=") {
      return undefined;
    }
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Left")), lifecycleContext) ||
      hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Right")), lifecycleContext)
      ? { kind: "operator", description: `C# '${operator}' operator emission` }
      : undefined;
  }
  if (ast.is.IsPrefixUnaryExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Operand")), lifecycleContext)
      ? { kind: "operator", description: "C# prefix unary operator emission" }
      : undefined;
  }
  if (ast.is.IsTypeOfExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "operator", description: "C# 'typeof' operator emission" }
      : undefined;
  }
  if (ast.kindName(node) === "KindVoidExpression") {
    const operand = getUnaryExpressionOperand(node, ast);
    return operand !== undefined && (hasOpaqueAnyCarrier(operand, lifecycleContext) || getOpaqueAnyOperation(operand, lifecycleContext) !== undefined)
      ? { kind: "operator", description: "C# 'void' operator emission" }
      : undefined;
  }
  if (ast.is.IsDeleteExpression(node)) {
    const operand = asNodeSubject(getNodeField(node, "Expression"));
    return isAnyDeleteOperand(operand, ast, lifecycleContext)
      ? { kind: "operator", description: "C# 'delete' operator emission" }
      : undefined;
  }
  return undefined;
}

function getUnaryExpressionOperand(
  node: Node,
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
): Node | undefined {
  return asNodeSubject(getNodeField(node, "Expression")) ??
    asNodeSubject(getNodeField(node, "Operand")) ??
    getAstReaderChildNodes(ast, node).map(asNodeSubject).find((child): child is Node => child !== undefined);
}

function isAnyDeleteOperand(
  operand: Node | undefined,
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): boolean {
  if (operand === undefined) {
    return false;
  }
  if (hasOpaqueAnyCarrier(operand, lifecycleContext)) {
    return true;
  }
  if (ast.is.IsPropertyAccessExpression(operand) || ast.is.IsElementAccessExpression(operand)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(operand, "Expression")), lifecycleContext);
  }
  return false;
}

function hasOpaqueAnyCarrier(
  subject: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): boolean {
  if (subject === undefined) {
    return false;
  }
  if (
    isCsharpAnyRuntimeCarrier(lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey)?.carrier) ||
    isCsharpAnyRuntimeCarrier(lifecycleContext.host.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier)
  ) {
    return true;
  }
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return false;
  }
  let semanticType: Type | undefined;
  try {
    semanticType = compiler.checker.getTypeAtLocation(subject, { sourceFile: compiler.ast.getSourceFile(subject) });
  } catch {
    return false;
  }
  return semanticType !== undefined && (
    compiler.typeShape.isAny(semanticType) ||
    isCsharpAnyRuntimeCarrier(lifecycleContext.host.factResolver.resolve(semanticType, runtimeCarrierFactKey)?.carrier)
  );
}
