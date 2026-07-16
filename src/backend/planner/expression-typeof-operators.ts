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
} from "../roslyn/syntax.js";
import {
  expressionToCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  tryPlanRuntimeUnionTypeTest,
} from "./runtime-union-projections.js";
import {
  CsharpTargetOperatorOperation,
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import type {
  CsharpTargetOperationFact,
} from "../../source/csharp-facts.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  targetTypeRefEquals,
} from "../../source/csharp-source-semantics/target-ref-utils.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "./expression-binary-operands.js";
import {
  planClosedCompatRuntimeStaticOperation,
  tryPlanCompatRuntimeUnaryOperator,
} from "./compat-runtime-operations.js";
import {
  isCsharpClosedCompatRuntimeCarrier,
} from "../../source/csharp-source-semantics/target-types.js";

export function planTypeofExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator === undefined) {
    const operand = Node_Expression(input.ast, node);
    const ownership = getProviderOperationOwnership(operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# typeof expression emission requires a selected provider typeof operator fact.", ownership);
    return undefined;
  }
  if (selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Typeof expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeTypeof = tryPlanCompatRuntimeUnaryOperator(node, Node_Expression(input.ast, node), sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeTypeof !== undefined) {
    return compatRuntimeTypeof;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const operation = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (operation === undefined || operation.operationId !== selectedOperator.operationId || operation.kind !== "typeof-runtime") {
    const operand = Node_Expression(input.ast, node);
    const ownership = getProviderOperationOwnership(operand, sourceFile, input);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# typeof expression emission requires a selected provider typeof operator fact.", ownership);
    return undefined;
  }
  return { kind: "LiteralExpression", value: operation.runtimeKind };
}

export function tryPlanTypeTestExpression(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const csharpOperation = getSelectedCsharpOperator(input, expression, selectedOperator);
  if (selectedOperator?.operationKind !== "operator" || csharpOperation?.kind !== "intrinsic-operator" || csharpOperation.operator !== CsharpTargetOperatorOperation.typeTest) {
    return undefined;
  }
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (left === undefined || right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a type-test operation, but the expression is missing an operand."));
    return undefined;
  }
  const planned = planExpression(left, sourceFile, input, diagnostics);
  if (planned === undefined) {
    return undefined;
  }
  return {
    kind: "IsPatternExpression",
    expression: planned,
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
  const comparison = getSelectedCsharpOperator(input, expression, selectedOperator);
  if (selectedOperator?.operationKind !== "operator" || comparison?.kind !== "typeof-comparison") {
    return undefined;
  }
  const operand = getTypeofComparisonOperand(expression, input);
  if (operand === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, "Provider selected a typeof comparison operation, but the compared expression is not a typeof expression."));
    return undefined;
  }
  const targetType = csharpTypeFromTargetTypeRef(comparison.targetType);
  if (targetType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operand, `Provider selected unsupported typeof comparison target '${comparison.runtimeKind}'.`));
    return undefined;
  }
  const operandCarrier = getRuntimeCarrierForExpression(input, operand, sourceFile);
  if (operandCarrier !== undefined && targetTypeRefEquals(operandCarrier, comparison.targetType)) {
    return { kind: "LiteralExpression", value: comparison.negated !== true };
  }
  const planned = planExpression(operand, sourceFile, input, diagnostics);
  if (planned === undefined) {
    return undefined;
  }
  const runtimeUnionTest = tryPlanRuntimeUnionTypeTest(
    operand,
    comparison.targetType,
    sourceFile,
    input,
    diagnostics,
    planned,
    comparison.negated === true,
  );
  if (runtimeUnionTest !== undefined) {
    return runtimeUnionTest;
  }
  if (operandCarrier !== undefined && isCsharpClosedCompatRuntimeCarrier(operandCarrier)) {
    const runtimeTypeof = planClosedCompatRuntimeStaticOperation(
      expression,
      comparison.compatRuntimeOperation,
      [operand],
      "C# compat-runtime typeof comparison",
      sourceFile,
      input,
      diagnostics,
      planExpression,
    );
    return runtimeTypeof === undefined
      ? undefined
      : {
          kind: "BinaryExpression",
          left: runtimeTypeof,
          operatorToken: { kind: comparison.negated ? "ExclamationEqualsToken" : "EqualsEqualsToken" },
          right: { kind: "LiteralExpression", value: comparison.runtimeKind },
        };
  }
  return {
    kind: "IsPatternExpression",
    expression: planned,
    type: targetType,
    ...(comparison.negated ? { negated: true } : {}),
  };
}

function getSelectedCsharpOperator(
  input: TargetCompileInput,
  expression: Node,
  selectedOperator: ReturnType<TargetCompileInput["facts"]["getSelectedTargetOperator"]>,
): CsharpTargetOperationFact | undefined {
  if (selectedOperator === undefined) {
    return undefined;
  }
  const operation = input.facts.getFact(expression, csharpTargetOperationFactKey);
  return operation?.operationId === selectedOperator.operationId ? operation : undefined;
}

function getTypeofComparisonOperand(
  expression: NonNullable<ReturnType<typeof AsBinaryExpression>>,
  input: TargetCompileInput,
): Node | undefined {
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (HasSourceKind(input.ast, left, KindTypeOfExpression)) {
    return Node_Expression(input.ast, left);
  }
  if (HasSourceKind(input.ast, right, KindTypeOfExpression)) {
    return Node_Expression(input.ast, right);
  }
  return undefined;
}
