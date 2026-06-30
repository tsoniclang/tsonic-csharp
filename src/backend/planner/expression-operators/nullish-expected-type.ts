import {
  AsBinaryExpression,
  HasSourceKind,
  KindBinaryExpression,
  SourceKind,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  csharpTargetOperationFactKey,
} from "../../../source/csharp-facts.js";
import {
  csharpBinaryOperatorTokenFromText,
} from "../csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getBinaryLeft,
  getBinaryRight,
} from "../expression-binary-operands.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  getProviderOperationOwnership,
  pushMissingTargetFactDiagnostic,
} from "../semantic-guards.js";
import {
  sameCsharpType,
} from "../csharp-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  getTargetTypeRefForNode,
} from "../runtime-carriers.js";
import {
  combineOwnership,
} from "./ownership.js";

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
    const leftCompatibleResultType = getNullishOperandExpectedCompatibleType(left, sourceFile, input);
    if (leftCompatibleResultType !== undefined && sameCsharpType(leftCompatibleResultType, expectedType)) {
      return expectedType;
    }
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# nullish coalescing expected-type emission requires the finalized operator result target type to match the enclosing expected target type."));
    return undefined;
  }
  return resultType;
}

function getNullishOperandExpectedCompatibleType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const resultType = input.facts.getFact(node, csharpTargetOperationFactKey)?.resultType ??
    getTargetTypeRefForNode(input, node, sourceFile);
  if (resultType === undefined) {
    return undefined;
  }
  const rendered = csharpTypeFromTargetTypeRef(resultType);
  return rendered?.kind === "NullableType" ? rendered.inner : rendered;
}
