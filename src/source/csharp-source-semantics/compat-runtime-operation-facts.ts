import type {
  ExtensionLifecycleContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpTargetMemberOperationFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getPropertyAccessName,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getBinaryOperatorText,
} from "./operator-syntax.js";
import {
  targetOperation,
  recordTargetOperationFact,
} from "./operations.js";
import {
  compatAnyCallOperation,
  compatAnyConstructOperation,
  compatAnyElementReadOperation,
  compatAnyElementWriteOperation,
  compatAnyPropertyReadOperation,
  compatAnyPropertyWriteOperation,
  csharpCompatRuntimeEvidence,
} from "./compat-runtime-operation-model.js";
import {
  getOpaqueAnyOperation,
} from "./opaque-any-diagnostics/opaque-operation.js";

export function recordCsharpCompatRuntimeOperationFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): void {
  if (compatibilityMode !== "compat") {
    return;
  }
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    recordCompatRuntimeOperationFactsForSourceFile(lifecycleContext, sourceFile);
  }
}

function recordCompatRuntimeOperationFactsForSourceFile(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
  sourceFile: SourceFile,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
    const operation = getCompatRuntimeOperationFact(node, lifecycleContext);
    if (operation === undefined) {
      return;
    }
    if (lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
      return;
    }
    lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, operation, csharpCompatRuntimeEvidence);
    recordTargetOperationFact(lifecycleContext.host, node, targetOperation(operation.operationId, operation.operationKind, operation.memberName, {
      resultType: operation.resultType,
    }), csharpCompatRuntimeEvidence);
  });
}

function getCompatRuntimeOperationFact(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): CsharpTargetMemberOperationFact | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  const assignment = getCompatRuntimeAssignmentOperation(node, lifecycleContext);
  if (assignment !== undefined) {
    return assignment;
  }
  const sourceOperation = getOpaqueAnyOperation(node, lifecycleContext);
  if (sourceOperation === undefined) {
    return undefined;
  }
  if (ast.is.IsPropertyAccessExpression(node)) {
    const propertyName = getPropertyAccessName(node, ast);
    return propertyName === undefined
      ? undefined
      : compatAnyPropertyReadOperation(propertyName);
  }
  if (ast.is.IsElementAccessExpression(node)) {
    return compatAnyElementReadOperation();
  }
  if (ast.is.IsCallExpression(node)) {
    return compatAnyCallOperation(callArgumentCount(node));
  }
  if (ast.is.IsNewExpression(node)) {
    return compatAnyConstructOperation(callArgumentCount(node));
  }
  return undefined;
}

function getCompatRuntimeAssignmentOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): CsharpTargetMemberOperationFact | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsBinaryExpression(node) || getBinaryOperatorText(compiler.ast, node) !== "=") {
    return undefined;
  }
  const left = asNodeSubject(getNodeField(node, "Left"));
  if (left === undefined) {
    return undefined;
  }
  const propertyName = compiler.ast.is.IsPropertyAccessExpression(left)
    ? getPropertyAccessName(left, compiler.ast)
    : undefined;
  if (propertyName !== undefined && getOpaqueAnyOperation(left, lifecycleContext)?.kind === "property") {
    return compatAnyPropertyWriteOperation(propertyName);
  }
  if (compiler.ast.is.IsElementAccessExpression(left) && getOpaqueAnyOperation(left, lifecycleContext)?.kind === "element") {
    return compatAnyElementWriteOperation();
  }
  return undefined;
}

function callArgumentCount(node: Node): number {
  const argumentsNode = getNodeField(node, "Arguments");
  const nodes = Array.isArray((argumentsNode as { readonly Nodes?: unknown } | undefined)?.Nodes)
    ? (argumentsNode as { readonly Nodes: readonly unknown[] }).Nodes
    : [];
  return nodes.length;
}
