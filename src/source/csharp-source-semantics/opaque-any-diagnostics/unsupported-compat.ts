import {
  csharpTargetOperationFactKey,
  getRecordedCsharpRuntimeCarrierFact,
} from "../../csharp-facts.js";
import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
} from "../ast-utils.js";
import {
  getOpaqueAnyOperation,
} from "./opaque-operation.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../target-types.js";
import {
  getBinaryOperatorText,
} from "../operator-syntax.js";
import {
  hardRejectedCompatOperation,
} from "./diagnostic-constants.js";
import type {
  UnsupportedCompatRuntimeOperation,
} from "./diagnostic-constants.js";
import {
  isClosedCompatRuntimeOperationFact,
} from "./closed-compat.js";

export function getUnsupportedCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): UnsupportedCompatRuntimeOperation | undefined {
  const sourceOperation = getUnsupportedSourceCompatRuntimeOperation(node, lifecycleContext);
  if (sourceOperation !== undefined) {
    return sourceOperation;
  }
  const anyDeleteOperation = getUnsupportedAnyDeleteOperation(node, lifecycleContext);
  if (anyDeleteOperation !== undefined) {
    return anyDeleteOperation;
  }
  const operation = lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey);
  if (
    isClosedCompatRuntimeOperationFact(operation) &&
    !isExplicitTypeScriptAnyCompatOperation(node, lifecycleContext)
  ) {
    return hardRejectedCompatOperation(
      "non-any-compat-carrier",
      "C# compat-runtime carrier operation facts can only attach to explicit TypeScript any operations.",
      "The finalized operation fact targets a closed TsValue/TsObject/TsArray/TsFunction-style carrier, but the source expression was not proven to operate on a TypeScript any runtime carrier. unknown, object, and statically typed values must not become dynamic through target facts.",
    );
  }
  return undefined;
}

function isExplicitTypeScriptAnyCompatOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): boolean {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return false;
  }
  if (getOpaqueAnyOperation(node, lifecycleContext) !== undefined) {
    return true;
  }
  const ast = compiler.ast;
  if (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node)) {
    return isExplicitTypeScriptAnySubject(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext);
  }
  if (ast.is.IsPropertyAccessExpression(node) || ast.is.IsElementAccessExpression(node)) {
    return isExplicitTypeScriptAnySubject(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext);
  }
  if (ast.is.IsBinaryExpression(node) && getBinaryOperatorText(ast, node) === "=") {
    return isExplicitTypeScriptAnyAssignmentOperation(node, lifecycleContext);
  }
  if (ast.is.IsTypeOfExpression(node)) {
    return isExplicitTypeScriptAnySubject(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext);
  }
  if (ast.kindName(node) === "KindVoidExpression") {
    const operand = getUnaryExpressionOperand(node, ast);
    return isExplicitTypeScriptAnySubject(operand, lifecycleContext) ||
      (operand !== undefined && getOpaqueAnyOperation(operand, lifecycleContext) !== undefined);
  }
  if (ast.is.IsDeleteExpression(node)) {
    return isExplicitTypeScriptAnyDeleteExpression(node, lifecycleContext);
  }
  return false;
}

function getUnaryExpressionOperand(
  node: Node,
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
): Node | undefined {
  return asNodeSubject(getNodeField(node, "Expression")) ??
    asNodeSubject(getNodeField(node, "Operand")) ??
    getAstReaderChildNodes(ast, node).map(asNodeSubject).find((child): child is Node => child !== undefined);
}

function isExplicitTypeScriptAnyAssignmentOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): boolean {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsBinaryExpression(node) || getBinaryOperatorText(compiler.ast, node) !== "=") {
    return false;
  }
  const left = asNodeSubject(getNodeField(node, "Left"));
  if (left === undefined) {
    return false;
  }
  if (getOpaqueAnyOperation(left, lifecycleContext) !== undefined) {
    return true;
  }
  if (compiler.ast.is.IsPropertyAccessExpression(left) || compiler.ast.is.IsElementAccessExpression(left)) {
    return isExplicitTypeScriptAnySubject(asNodeSubject(getNodeField(left, "Expression")), lifecycleContext);
  }
  return false;
}

function isExplicitTypeScriptAnySubject(
  subject: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): boolean {
  const compiler = lifecycleContext.compiler;
  if (subject === undefined || compiler === undefined) {
    return false;
  }
  if (isCsharpAnyRuntimeCarrier(getRecordedCsharpRuntimeCarrierFact(lifecycleContext.host.facts, subject)?.carrier)) {
    return true;
  }
  const sourceFile = compiler.ast.getSourceFile(subject);
  const type = sourceFile === undefined ? undefined : compiler.checker.getTypeAtLocation(subject, { sourceFile });
  return type !== undefined && compiler.typeShape.isAny(type);
}

function isExplicitTypeScriptAnyDeleteExpression(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): boolean {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsDeleteExpression(node)) {
    return false;
  }
  const operand = asNodeSubject(getNodeField(node, "Expression"));
  if (operand === undefined) {
    return false;
  }
  if (isExplicitTypeScriptAnySubject(operand, lifecycleContext)) {
    return true;
  }
  if (compiler.ast.is.IsPropertyAccessExpression(operand) || compiler.ast.is.IsElementAccessExpression(operand)) {
    return isExplicitTypeScriptAnySubject(asNodeSubject(getNodeField(operand, "Expression")), lifecycleContext);
  }
  return false;
}

function getUnsupportedAnyDeleteOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): UnsupportedCompatRuntimeOperation | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsDeleteExpression(node) || !isExplicitTypeScriptAnyDeleteExpression(node, lifecycleContext)) {
    return undefined;
  }
  return hardRejectedCompatOperation(
    "any-delete-operator",
    "C# compatibility mode has no closed compat-runtime carrier operation for TypeScript any operator 'delete'.",
    "delete mutates JavaScript object/array property presence and sparse-slot state; Tsonic must not approximate it without an explicit closed delete carrier operation and finalized target fact.",
  );
}

export function getUnsupportedSourceCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "compiler">,
): UnsupportedCompatRuntimeOperation | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  if (ast.kindName(node) === "KindWithStatement") {
    return hardRejectedCompatOperation(
      "with-statement",
      "C# emission cannot support JavaScript 'with' dynamic scope.",
      "'with' changes lexical name lookup through dynamic scope at runtime; no closed Tsonic-owned carrier can make those bindings statically visible to the C# backend.",
    );
  }
  if (ast.kindName(node) === "KindPropertyAssignment" && getNodeNameText(ast, node) === "__proto__") {
    return hardRejectedCompatOperation(
      "proto-object-literal",
      "C# emission cannot support object-literal __proto__ prototype mutation.",
      "An object-literal __proto__ member changes the created object's prototype; Tsonic has no closed target object-shape mutation carrier for this operation.",
    );
  }
  return undefined;
}

function getNodeNameText(
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const name = ast.name(node) ?? asNodeSubject(getNodeField(node, "Name")) ?? asNodeSubject(getNodeField(node, "name"));
  if (name === undefined) {
    return undefined;
  }
  const kind = ast.kindName(name);
  return kind === "KindIdentifier" || kind === "KindStringLiteral" || kind === "KindNoSubstitutionTemplateLiteral"
    ? ast.text(name)
    : undefined;
}
