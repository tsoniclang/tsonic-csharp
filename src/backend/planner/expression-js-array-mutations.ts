import {
  AsBinaryExpression,
  AsDeleteExpression,
  AsElementAccessExpression,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindBinaryExpression,
  KindDeleteExpression,
  KindElementAccessExpression,
  KindExpressionStatement,
  KindPropertyAccessExpression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import {
  csharpTargetMutationOperationFactKey,
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  csharpJsArrayDeleteAtOperationId,
  csharpJsArrayLengthPropertyOperationIds,
  csharpJsArraySetLengthOperationId,
} from "../../source/csharp-source-semantics/surfaces/js/array-mutations.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "./expression-binary-operands.js";

export function tryPlanJsArrayDeleteExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindDeleteExpression)) {
    return undefined;
  }
  const operation = input.facts.getFact(node, csharpTargetMutationOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission requires a finalized JSArray.deleteAt mutation operation fact; delete is not approximated from syntax."));
    return undefined;
  }
  if (operation.kind !== "member" || operation.operationKind !== "method" || operation.operationId !== csharpJsArrayDeleteAtOperationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission requires the finalized JSArray.deleteAt operation fact."));
    return undefined;
  }
  const operand = AsDeleteExpression(node)?.Expression;
  if (!HasSourceKind(input.ast, operand, KindElementAccessExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission currently supports checked array element deletion only."));
    return undefined;
  }
  const elementAccess = AsElementAccessExpression(operand)!;
  if (elementAccess.Expression === undefined || elementAccess.ArgumentExpression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission requires finalized receiver and index expressions."));
    return undefined;
  }
  const receiver = planExpression(elementAccess.Expression, sourceFile, input, diagnostics);
  const argument = planExpression(elementAccess.ArgumentExpression, sourceFile, input, diagnostics);
  if (receiver === undefined || argument === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: operation.memberName,
    },
    arguments: [{
      kind: "Argument",
      expression: argument,
    }],
  };
}

export function tryPlanJsArrayLengthMutationExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return undefined;
  }
  const expression = AsBinaryExpression(node)!;
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (!isSelectedJsArrayLengthProperty(left, input)) {
    return undefined;
  }
  const operation = input.facts.getFact(node, csharpTargetMutationOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires a finalized JSArray.setLength operation fact; it is not lowered as a C# property assignment."));
    return undefined;
  }
  if (operation.kind !== "member" || operation.operationKind !== "method" || operation.operationId !== csharpJsArraySetLengthOperationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires the finalized JSArray.setLength operation fact."));
    return undefined;
  }
  if (!isExpressionStatementExpression(node, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length assignment currently requires expression-statement position because TypeScript assignment value semantics require a finalized sequence-expression fact."));
    return undefined;
  }
  if (left === undefined || right === undefined || !HasSourceKind(input.ast, left, KindPropertyAccessExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires finalized property receiver and length expressions."));
    return undefined;
  }
  const propertyAccess = AsPropertyAccessExpression(left)!;
  if (propertyAccess.Expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires a finalized receiver expression."));
    return undefined;
  }
  const receiver = planExpression(propertyAccess.Expression, sourceFile, input, diagnostics);
  const argument = planExpression(right, sourceFile, input, diagnostics);
  if (receiver === undefined || argument === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: operation.memberName,
    },
    arguments: [{
      kind: "Argument",
      expression: argument,
    }],
  };
}

function isSelectedJsArrayLengthProperty(
  node: Node | undefined,
  input: TargetCompileInput,
): boolean {
  if (!HasSourceKind(input.ast, node, KindPropertyAccessExpression)) {
    return false;
  }
  const selected = input.facts.getSelectedTargetProperty(node);
  const csharpOperation = input.facts.getFact(node, csharpTargetOperationFactKey);
  return selected !== undefined &&
    csharpJsArrayLengthPropertyOperationIds.has(selected.operationId) &&
    csharpOperation?.kind === "member" &&
    csharpOperation.operationKind === "property";
}

function isExpressionStatementExpression(
  node: Node,
  input: TargetCompileInput,
): boolean {
  const parent = input.ast.parent(node);
  return parent !== undefined &&
    HasSourceKind(input.ast, parent, KindExpressionStatement) &&
    (parent as { readonly Expression?: Node }).Expression === node;
}
