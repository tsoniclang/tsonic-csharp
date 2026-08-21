import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpResolvedBinaryOperation,
} from "../../../../policy/operations/index.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import type {
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "../csharp-operator-tokens.js";
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
  planBinaryOperand,
} from "./operands.js";

export function planSelectedCsharpBinaryOperation(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
): CsharpExpression | undefined {
  if (selection.targetOperation.kind === "nullish-test") {
    const operandNode = selection.targetOperation.operand === "left"
      ? selection.left
      : selection.right;
    const operand = planExpression(
      operandNode,
      sourceFile,
      input,
      diagnostics,
    );
    return operand === undefined
      ? undefined
      : {
          kind: "NullPatternExpression",
          expression: operand,
          negated: selection.targetOperation.negated,
        };
  }
  const targetOperator = selection.targetOperation.operator;
  const assignmentToken = csharpAssignmentOperatorTokenFromText(
    targetOperator,
  );
  if (assignmentToken !== undefined) {
    const left = planExpression(
      selection.left,
      sourceFile,
      input,
      diagnostics,
    );
    const expectedRightType = csharpTypeFromTargetTypeRef(selection.leftType);
    const right = selection.sourceOperator === "=" && expectedRightType !== undefined
      ? planExpressionWithExpectedType(
          selection.right,
          sourceFile,
          input,
          diagnostics,
          expectedRightType,
          undefined,
          selection.leftType,
        )
      : planExpression(
          selection.right,
          sourceFile,
          input,
          diagnostics,
        );
    return left === undefined || right === undefined
      ? undefined
      : {
          kind: "AssignmentExpression",
          left,
          operatorToken: assignmentToken,
          right,
        };
  }
  const binaryToken = csharpBinaryOperatorTokenFromText(targetOperator);
  if (binaryToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected C# operator '${targetOperator}' has no target AST token.`,
    ));
    return undefined;
  }
  const left = planBinaryOperand(
    selection.left,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planExpressionWithExpectedType,
    csharpTypeFromTargetTypeRef(selection.leftInputType),
    selection.leftInputType,
  );
  const right = planBinaryOperand(
    selection.right,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planExpressionWithExpectedType,
    csharpTypeFromTargetTypeRef(selection.rightInputType),
    selection.rightInputType,
  );
  return left === undefined || right === undefined
    ? undefined
    : {
        kind: "BinaryExpression",
        left,
        operatorToken: binaryToken,
        right,
      };
}
