import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  sourcePrimitiveImplicitlyConverts,
} from "../../../../policy/conversions/index.js";
import {
  selectCsharpBinaryOperation,
} from "../../../../policy/operations/index.js";
import type {
  CsharpSourceOperator,
} from "../../../../policy/operations/index.js";
import type {
  TargetTypeRef,
} from "../../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import {
  targetTypeRefEquals,
} from "../../../../policy/types/index.js";
import {
  sameCsharpType,
} from "../../types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  planSelectedCsharpBinaryOperation,
} from "./selected-binary.js";

export function tryPlanBinaryExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject: Node | undefined,
  expectedTargetType: TargetTypeRef | undefined,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  if (!input.program.source.ast.is.IsBinaryExpression(node)) {
    return undefined;
  }
  const selection = selectCsharpBinaryOperation(
    input.policy,
    node,
    sourceFile,
    expectedTargetType,
  );
  if (selection.kind === "rejected") {
    return undefined;
  }
  if (selection.sourceOperator !== "??") {
    return binaryOperationUsesExpectedNumericType(selection.sourceOperator) &&
      expectedTargetType !== undefined &&
      targetTypeRefEquals(selection.resultType, expectedTargetType)
      ? planSelectedCsharpBinaryOperation(
          node,
          selection,
          sourceFile,
          input,
          diagnostics,
          planExpression,
          planExpressionWithExpectedType,
        )
      : undefined;
  }
  const resultType = selectExpectedResultType(
    selection.resultType,
    selection.leftType,
    expectedType,
    expectedTargetType,
  );
  if (resultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# nullish coalescing result does not match the enclosing expected target type.",
    ));
    return undefined;
  }
  const left = planExpression(
    selection.left,
    sourceFile,
    input,
    diagnostics,
  );
  const right = planExpressionWithExpectedType(
    selection.right,
    sourceFile,
    input,
    diagnostics,
    resultType,
    expectedTypeSubject,
    expectedTargetType,
  );
  return left === undefined || right === undefined
    ? undefined
    : {
        kind: "BinaryExpression",
        left,
        operatorToken: { kind: "QuestionQuestionToken" },
        right,
      };
}

function binaryOperationUsesExpectedNumericType(
  operator: CsharpSourceOperator,
): boolean {
  switch (operator) {
    case "+":
    case "-":
    case "*":
    case "**":
    case "/":
    case "%":
    case "&":
    case "|":
    case "^":
    case "<<":
    case ">>":
    case ">>>":
      return true;
    default:
      return false;
  }
}

function selectExpectedResultType(
  resultTarget: TargetTypeRef,
  leftTarget: TargetTypeRef,
  expectedType: CsharpTypeNode,
  expectedTarget: TargetTypeRef | undefined,
): CsharpTypeNode | undefined {
  const resultType = csharpTypeFromTargetTypeRef(resultTarget);
  if (resultType === undefined) {
    return undefined;
  }
  if (
    expectedType.kind === "IdentifierName" &&
    expectedType.name === "var"
  ) {
    return resultType;
  }
  if (sameCsharpType(resultType, expectedType)) {
    return resultType;
  }
  const leftType = csharpTypeFromTargetTypeRef(leftTarget);
  const leftValueType = leftType?.kind === "NullableType"
    ? leftType.inner
    : leftType;
  if (
    leftValueType !== undefined &&
    sameCsharpType(leftValueType, expectedType)
  ) {
    return expectedType;
  }
  return expectedTarget !== undefined &&
    sourcePrimitiveImplicitlyConverts(expectedTarget, resultTarget)
    ? resultType
    : undefined;
}
