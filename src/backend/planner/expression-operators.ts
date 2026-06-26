import {
  AsBinaryExpression,
  AsElementAccessExpression,
  AsIdentifier,
  HasSourceKind,
  KindBinaryExpression,
  KindElementAccessExpression,
  KindIdentifier,
  KindNullKeyword,
  KindPropertyAccessExpression,
  KindVoidExpression,
  Node_Expression,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpBinaryOperatorToken, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import type { OperationSemanticOwnership } from "./semantic-guards.js";
import type {
  ExpressionPlanner,
  ExpectedExpressionPlanner,
} from "./expression-planner-types.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "./expression-binary-operands.js";
import {
  tryPlanTypeofComparisonExpression,
  tryPlanTypeTestExpression,
} from "./expression-typeof-operators.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "./csharp-operator-tokens.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  sameCsharpType,
} from "./csharp-types.js";
import {
  isDestructuringAssignmentExpression,
  pushMissingDestructuringAssignmentFactsDiagnostic,
} from "./destructuring-assignment.js";
import {
  tryPlanCompatRuntimeElementSet,
  tryPlanCompatRuntimePropertySet,
} from "./compat-runtime-operations.js";
import {
  tryPlanJsArrayLengthMutationExpression,
} from "./expression-js-array-mutations.js";

export {
  planTypeofExpression,
} from "./expression-typeof-operators.js";

export function tryPlanBinaryExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return undefined;
  }
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  const expression = AsBinaryExpression(node)!;
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (SourceKind(input.ast, expression.OperatorToken) === "KindEqualsToken") {
    const propertyDiagnosticsStart = diagnostics.length;
    const compatRuntimePropertySet = tryPlanCompatRuntimePropertySet(node, getCompatRuntimePropertySetReceiver(left, input), right, sourceFile, input, diagnostics, planExpression);
    if (compatRuntimePropertySet !== undefined) {
      return compatRuntimePropertySet;
    }
    if (diagnostics.length > propertyDiagnosticsStart) {
      return undefined;
    }
    const compatRuntimeElementSetSource = getCompatRuntimeElementSetSource(left, input);
    const elementDiagnosticsStart = diagnostics.length;
    const compatRuntimeElementSet = tryPlanCompatRuntimeElementSet(node, compatRuntimeElementSetSource?.receiver, compatRuntimeElementSetSource?.argument, right, sourceFile, input, diagnostics, planExpression);
    if (compatRuntimeElementSet !== undefined) {
      return compatRuntimeElementSet;
    }
    if (diagnostics.length > elementDiagnosticsStart) {
      return undefined;
    }
    const jsArrayDiagnosticsStart = diagnostics.length;
    const jsArrayLengthMutation = tryPlanJsArrayLengthMutationExpression(node, sourceFile, input, diagnostics, planExpression);
    if (jsArrayLengthMutation !== undefined) {
      return jsArrayLengthMutation;
    }
    if (diagnostics.length > jsArrayDiagnosticsStart) {
      return undefined;
    }
  }
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  if (isDestructuringAssignmentExpression(node, input)) {
    pushMissingDestructuringAssignmentFactsDiagnostic(left ?? node, diagnostics);
    return undefined;
  }
  const typeTestDiagnosticsStart = diagnostics.length;
  const typeTest = tryPlanTypeTestExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeTest !== undefined) {
    return typeTest;
  }
  if (diagnostics.length > typeTestDiagnosticsStart) {
    return undefined;
  }
  const typeofDiagnosticsStart = diagnostics.length;
  const typeofComparison = tryPlanTypeofComparisonExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeofComparison !== undefined) {
    return typeofComparison;
  }
  if (diagnostics.length > typeofDiagnosticsStart) {
    return undefined;
  }
  if (selectedOperator === undefined) {
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return undefined;
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# binary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return undefined;
  }
  const binaryOperatorToken = csharpBinaryOperatorTokenFromText(csharpOperator.operator);
  const assignmentOperatorToken = csharpAssignmentOperatorTokenFromText(csharpOperator.operator);
  if (binaryOperatorToken === undefined && assignmentOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return undefined;
  }
  if (assignmentOperatorToken !== undefined) {
    const leftExpression = planExpression(left!, sourceFile, input, diagnostics);
    const rightExpression = planExpression(right!, sourceFile, input, diagnostics);
    if (leftExpression === undefined || rightExpression === undefined) {
      return undefined;
    }
    return {
      kind: "AssignmentExpression",
      left: leftExpression,
      operatorToken: assignmentOperatorToken,
      right: rightExpression,
    };
  }
  if (binaryOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return undefined;
  }
  const leftExpression = planBinaryOperand(left!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression);
  const rightExpression = planBinaryOperand(right!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression);
  if (leftExpression === undefined || rightExpression === undefined) {
    return undefined;
  }
  return {
    kind: "BinaryExpression",
    left: leftExpression,
    operatorToken: binaryOperatorToken,
    right: rightExpression,
  };
}

export function tryPlanBinaryExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return undefined;
  }
  const expression = AsBinaryExpression(node)!;
  if (SourceKind(input.ast, expression.OperatorToken) !== "KindQuestionQuestionToken") {
    return undefined;
  }
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  if (left === undefined || right === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Nullish coalescing expected-type emission requires both operands before C# emission."));
    return undefined;
  }
  const expectedResultType = getFinalizedNullishResultType(node, left, right, sourceFile, input, diagnostics, expectedType);
  if (expectedResultType === undefined) {
    return undefined;
  }
  const leftExpression = planExpression(left, sourceFile, input, diagnostics);
  const rightExpression = planExpressionWithExpectedType(right, sourceFile, input, diagnostics, expectedResultType, expectedTypeSubject);
  if (leftExpression === undefined || rightExpression === undefined) {
    return undefined;
  }
  return {
    kind: "BinaryExpression",
    left: leftExpression,
    operatorToken: { kind: "QuestionQuestionToken" },
    right: rightExpression,
  };
}

function getFinalizedNullishResultType(
  node: Node,
  left: Node,
  right: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
): CsharpTypeNode | undefined {
  const selectedOperator = input.facts.getSelectedTargetOperator(node);
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return undefined;
  }
  if (selectedOperator === undefined) {
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# nullish coalescing expected-type emission requires a selected provider operator fact.", ownership);
    return undefined;
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# nullish coalescing expected-type emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return undefined;
  }
  const operatorToken = csharpBinaryOperatorTokenFromText(csharpOperator.operator);
  if (operatorToken?.kind !== "QuestionQuestionToken") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# nullish coalescing expected-type emission received finalized operator token '${csharpOperator.operator}' instead of '??'.`));
    return undefined;
  }
  if (csharpOperator.resultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# nullish coalescing expected-type emission requires a finalized operator result target type before C# emission."));
    return undefined;
  }
  const resultType = csharpTypeFromTargetTypeRef(csharpOperator.resultType);
  if (resultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# nullish coalescing expected-type emission requires a renderable finalized operator result target type before C# emission."));
    return undefined;
  }
  if (!sameCsharpType(resultType, expectedType)) {
    const leftUnwrappedResultType = getNullishOperandUnwrappedResultType(left, input);
    if (leftUnwrappedResultType !== undefined && sameCsharpType(leftUnwrappedResultType, expectedType)) {
      return expectedType;
    }
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# nullish coalescing expected-type emission requires the finalized operator result target type to match the enclosing expected target type."));
    return undefined;
  }
  return resultType;
}

function getNullishOperandUnwrappedResultType(
  node: Node,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const resultType = input.facts.getFact(node, csharpTargetOperationFactKey)?.resultType;
  if (resultType === undefined) {
    return undefined;
  }
  const rendered = csharpTypeFromTargetTypeRef(resultType);
  return rendered?.kind === "NullableType" ? rendered.inner : undefined;
}

function planBinaryOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  return isNullishEqualityOperand(operand, operatorToken, sourceFile, input)
    ? { kind: "LiteralExpression", value: null }
    : planExpression(operand, sourceFile, input, diagnostics);
}

function getCompatRuntimePropertySetReceiver(
  node: Node | undefined,
  input: TargetCompileInput,
): Node | undefined {
  return HasSourceKind(input.ast, node, KindPropertyAccessExpression)
    ? Node_Expression(node)
    : undefined;
}

function getCompatRuntimeElementSetSource(
  node: Node | undefined,
  input: TargetCompileInput,
): { readonly receiver: Node | undefined; readonly argument: Node | undefined } | undefined {
  if (!HasSourceKind(input.ast, node, KindElementAccessExpression)) {
    return undefined;
  }
  const elementAccess = AsElementAccessExpression(node)!;
  return {
    receiver: elementAccess.Expression,
    argument: elementAccess.ArgumentExpression,
  };
}

function isNullishEqualityOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  if (operatorToken.kind !== "EqualsEqualsToken" && operatorToken.kind !== "ExclamationEqualsToken") {
    return false;
  }
  const kind = SourceKind(input.ast, operand);
  if (kind === KindNullKeyword || kind === KindVoidExpression) {
    return true;
  }
  if (kind !== KindIdentifier || Node_Text(AsIdentifier(operand)) !== "undefined") {
    return false;
  }
  const type = input.analysis.getTypeAtLocation(operand, { sourceFile });
  return type === undefined ? false : input.types.isNullish(type);
}

function combineOwnership(left: OperationSemanticOwnership, right: OperationSemanticOwnership): OperationSemanticOwnership {
  const reasons = [...left.reasons, ...right.reasons];
  return {
    requiresTargetFact: left.requiresTargetFact || right.requiresTargetFact,
    sourceOwned: left.sourceOwned && right.sourceOwned,
    reasons,
  };
}
