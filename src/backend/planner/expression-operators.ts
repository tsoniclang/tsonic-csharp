import {
  AsBinaryExpression,
  AsIdentifier,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindIdentifier,
  KindNullKeyword,
  KindObjectLiteralExpression,
  KindVoidExpression,
  Node_Text,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpBinaryOperatorToken, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
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
  if (selectedOperator !== undefined && selectedOperator.operationKind !== "operator") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `Binary expression expected a provider operator fact, but provider selected a ${selectedOperator.operationKind} operation.`));
    return invalidExpression("selected target operator");
  }
  const expression = AsBinaryExpression(node)!;
  const left = getBinaryLeft(expression);
  const right = getBinaryRight(expression);
  const typeTest = tryPlanTypeTestExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeTest !== undefined) {
    return typeTest;
  }
  const typeofComparison = tryPlanTypeofComparisonExpression(expression, selectedOperator, sourceFile, input, diagnostics, planExpression);
  if (typeofComparison !== undefined) {
    return typeofComparison;
  }
  if (selectedOperator === undefined) {
    const leftOwnership = getProviderOperationOwnership(left, sourceFile, input);
    const rightOwnership = getProviderOperationOwnership(right, sourceFile, input);
    const ownership = combineOwnership(leftOwnership, rightOwnership);
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# binary operator emission requires a selected provider operator fact.", ownership);
    return invalidExpression("missing target operator fact");
  }
  const csharpOperator = input.facts.getFact(node, csharpTargetOperationFactKey);
  if (csharpOperator?.kind !== "operator-token" || csharpOperator.operationId !== selectedOperator.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# binary operator emission requires a finalized C# operator-token fact matching the selected TSTS/provider operator."));
    return invalidExpression("missing C# operator token fact");
  }
  const binaryOperatorToken = csharpBinaryOperatorTokenFromText(csharpOperator.operator);
  const assignmentOperatorToken = csharpAssignmentOperatorTokenFromText(csharpOperator.operator);
  if (binaryOperatorToken === undefined && assignmentOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return invalidExpression("unsupported C# operator token");
  }
  if (assignmentOperatorToken !== undefined) {
    if (isDestructuringAssignmentTarget(left, input)) {
      diagnostics.push(unsupportedNodeDiagnostic(left ?? node, "Destructuring assignment emission requires finalized target storage and extraction facts before C# emission."));
      return invalidExpression("destructuring assignment without target storage facts");
    }
    return {
      kind: "AssignmentExpression",
      left: planExpression(left!, sourceFile, input, diagnostics),
      operatorToken: assignmentOperatorToken,
      right: planExpression(right!, sourceFile, input, diagnostics),
    };
  }
  if (binaryOperatorToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `C# binary operator emission received unsupported finalized operator token '${csharpOperator.operator}'.`));
    return invalidExpression("unsupported C# binary operator token");
  }
  return {
    kind: "BinaryExpression",
    left: planBinaryOperand(left!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression),
    operatorToken: binaryOperatorToken,
    right: planBinaryOperand(right!, binaryOperatorToken, sourceFile, input, diagnostics, planExpression),
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
    return invalidExpression("nullish coalescing operands");
  }
  const expectedResultType = getFinalizedNullishResultType(node, left, right, sourceFile, input, diagnostics, expectedType);
  if (expectedResultType === undefined) {
    return invalidExpression("nullish coalescing expected result type");
  }
  return {
    kind: "BinaryExpression",
    left: planExpression(left, sourceFile, input, diagnostics),
    operatorToken: { kind: "QuestionQuestionToken" },
    right: planExpressionWithExpectedType(right, sourceFile, input, diagnostics, expectedResultType, expectedTypeSubject),
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
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# nullish coalescing expected-type emission requires the finalized operator result target type to match the enclosing expected target type."));
    return undefined;
  }
  return resultType;
}

function planBinaryOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  return isNullishEqualityOperand(operand, operatorToken, sourceFile, input)
    ? { kind: "LiteralExpression", value: null }
    : planExpression(operand, sourceFile, input, diagnostics);
}

function isDestructuringAssignmentTarget(
  node: Node | undefined,
  input: TargetCompileInput,
): boolean {
  return HasSourceKind(input.ast, node, KindArrayLiteralExpression) ||
    HasSourceKind(input.ast, node, KindObjectLiteralExpression);
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
  const type = input.semantics.getTypeAtLocation(operand, { sourceFile });
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
