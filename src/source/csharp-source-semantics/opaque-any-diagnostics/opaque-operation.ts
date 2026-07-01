import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
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
  return undefined;
}

function hasOpaqueAnyCarrier(
  subject: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  if (subject === undefined) {
    return false;
  }
  return isCsharpAnyRuntimeCarrier(lifecycleContext.host.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier);
}
