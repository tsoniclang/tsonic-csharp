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
import {
  invalidExpression,
} from "./invalid-expression.js";
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
    return invalidExpression("missing C# JS array delete operation fact");
  }
  if (operation.kind !== "member" || operation.operationKind !== "method" || operation.operationId !== csharpJsArrayDeleteAtOperationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission requires the finalized JSArray.deleteAt operation fact."));
    return invalidExpression("invalid JS array delete operation fact");
  }
  const operand = AsDeleteExpression(node)?.Expression;
  if (!HasSourceKind(input.ast, operand, KindElementAccessExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission currently supports checked array element deletion only."));
    return invalidExpression("delete without element access");
  }
  const elementAccess = AsElementAccessExpression(operand)!;
  if (elementAccess.Expression === undefined || elementAccess.ArgumentExpression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface delete emission requires finalized receiver and index expressions."));
    return invalidExpression("delete element operands");
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: planExpression(elementAccess.Expression, sourceFile, input, diagnostics),
      name: operation.memberName,
    },
    arguments: [{
      kind: "Argument",
      expression: planExpression(elementAccess.ArgumentExpression, sourceFile, input, diagnostics),
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
    return invalidExpression("missing JS array length mutation fact");
  }
  if (operation.kind !== "member" || operation.operationKind !== "method" || operation.operationId !== csharpJsArraySetLengthOperationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires the finalized JSArray.setLength operation fact."));
    return invalidExpression("invalid JS array length mutation operation fact");
  }
  if (!isExpressionStatementExpression(node, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length assignment currently requires expression-statement position because TypeScript assignment value semantics require a finalized sequence-expression fact."));
    return invalidExpression("JS array length assignment value position");
  }
  if (left === undefined || right === undefined || !HasSourceKind(input.ast, left, KindPropertyAccessExpression)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires finalized property receiver and length expressions."));
    return invalidExpression("JS array length mutation operands");
  }
  const propertyAccess = AsPropertyAccessExpression(left)!;
  if (propertyAccess.Expression === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# JS surface Array.length mutation requires a finalized receiver expression."));
    return invalidExpression("JS array length mutation receiver");
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: planExpression(propertyAccess.Expression, sourceFile, input, diagnostics),
      name: operation.memberName,
    },
    arguments: [{
      kind: "Argument",
      expression: planExpression(right, sourceFile, input, diagnostics),
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
