import {
  AsBinaryExpression,
  HasSourceKind,
  KindTypeOfExpression,
  Node_Expression,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  expressionToCsharpType,
  predefined,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "./expression-binary-operands.js";

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator === undefined) {
    const operand = Node_Expression(node);
    const ownership = getProviderOperationOwnership(operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# typeof expression emission requires a selected provider typeof operator fact.", ownership);
    return invalidExpression("missing target typeof operator fact");
  }
  if (selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target typeof operator");
  }
  const runtimeKind = getStandaloneTypeofRuntimeKind(selectedOperator.targetOperation);
  if (runtimeKind === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider typeof operator fact, but provider selected '${selectedOperator.targetOperation}'.`));
    return invalidExpression("selected target non-typeof operator");
  }
  return { kind: "LiteralExpression", value: runtimeKind };
}

export function tryPlanTypeTestExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" || selectedOperator.targetOperation !== "is") {
    return undefined;
  }
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (left === undefined || right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a type-test operation, but the expression is missing an operand."));
    return invalidExpression("selected type-test without operands");
  }
  return {
    kind: "IsPatternExpression",
    expression: planExpression(left, sourceFile, input, diagnostics),
    type: expressionToCsharpType(right, sourceFile, input, diagnostics),
  };
}

export function tryPlanTypeofComparisonExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (selectedOperator?.operationKind !== "operator" ||
    (!selectedOperator.targetOperation.startsWith("typeof-is:") && !selectedOperator.targetOperation.startsWith("typeof-is-not:"))) {
    return undefined;
  }
  const operand = getTypeofComparisonOperand(expression, input);
  if (operand === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a typeof comparison operation, but the compared expression is not a typeof expression."));
    return invalidExpression("selected typeof comparison without typeof operand");
  }
  const targetKind = selectedOperator.targetOperation.slice(selectedOperator.targetOperation.indexOf(":") + 1);
  const targetType = getTypeofComparisonTargetType(targetKind);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operand, `Provider selected unsupported typeof comparison target '${targetKind}'.`));
    return invalidExpression("selected typeof comparison target");
  }
  return {
    kind: "IsPatternExpression",
    expression: planExpression(operand, sourceFile, input, diagnostics),
    type: targetType,
    ...(selectedOperator.targetOperation.startsWith("typeof-is-not:") ? { negated: true } : {}),
  };
}

function getStandaloneTypeofRuntimeKind(targetOperation: string): "string" | "number" | "boolean" | "bigint" | undefined {
  switch (targetOperation) {
    case "typeof:string":
      return "string";
    case "typeof:number":
      return "number";
    case "typeof:boolean":
      return "boolean";
    case "typeof:bigint":
      return "bigint";
    default:
      return undefined;
  }
}

function getTypeofComparisonTargetType(kind: string): CsharpTypeNode | undefined {
  switch (kind) {
    case "string":
      return predefined("string");
    case "number":
      return predefined("double");
    case "boolean":
      return predefined("bool");
    case "bigint":
      return csharpTypeFromTargetTypeRef({ kind: "target-named", id: "System.Numerics.BigInteger" });
    default:
      return undefined;
  }
}

function getTypeofComparisonOperand(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  input: TargetCompileInput,
): Node | undefined {
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (HasSourceKind(input.ast, left, KindTypeOfExpression)) {
    return Node_Expression(left);
  }
  if (HasSourceKind(input.ast, right, KindTypeOfExpression)) {
    return Node_Expression(right);
  }
  return undefined;
}
