import {
  AsVoidExpression,
  HasSourceKind,
  KindVoidExpression,
  Node_Expression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  asNodeSubject,
} from "../../source/fact-subjects.js";
import {
  getAstReaderChildNodes,
  getNodeField,
} from "../../source/csharp-source-semantics/ast-utils.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  tryPlanCompatRuntimeUnaryOperator,
} from "./compat-runtime-operations.js";

export function planVoidExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindVoidExpression)) {
    return undefined;
  }
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  const operand = getVoidExpressionOperand(node, input);
  if (selectedOperator === undefined) {
    const ownership = getProviderOperationOwnership(operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# void expression emission requires a selected provider void operator fact.", ownership);
    return undefined;
  }
  if (selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Void expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeVoid = tryPlanCompatRuntimeUnaryOperator(node, operand, sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeVoid !== undefined) {
    return compatRuntimeVoid;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const operation = input.facts.getFact(node, csharpTargetOperationFactKey);
  diagnostics.push(unsupportedNodeDiagnostic(
    node,
    operation === undefined
      ? "C# void expression emission requires a finalized closed compat-runtime void operation fact."
      : "C# void expression emission does not support the finalized provider operation shape.",
  ));
  return undefined;
}

function getVoidExpressionOperand(
  node: Node,
  input: TargetCompileInput,
): Node | undefined {
  return Node_Expression(input.ast, node) ??
    AsVoidExpression(node)?.Expression ??
    asNodeSubject(getNodeField(node, "Expression")) ??
    asNodeSubject(getNodeField(node, "Operand")) ??
    getAstReaderChildNodes(input.ast, node).map(asNodeSubject).find((child): child is Node => child !== undefined);
}
