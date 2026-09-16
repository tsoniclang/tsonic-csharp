import type { CsharpPlanningContext } from "../../context.js";
import {
  AsIdentifier,
  KindIdentifier,
  KindNullKeyword,
  KindVoidExpression,
  Node_Text,
  SourceKind,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpBinaryOperatorToken,
  CsharpExpression,
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import type {
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import { planVoidExpression } from "../expression-void.js";
import {
  isCsharpRuntimeNullTargetType,
  isCsharpRuntimeUndefinedTargetType,
} from "../../../../target-model/types/runtime-carriers.js";

export function planBinaryOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  expectedType: CsharpTypeNode | undefined,
  expectedTargetType: TargetTypeRef,
): CsharpExpression | undefined {
  if (SourceKind(input.program.source.ast, operand) === KindVoidExpression &&
    (operatorToken.kind === "EqualsEqualsToken" || operatorToken.kind === "ExclamationEqualsToken")) {
    return planVoidExpression(operand, sourceFile, input, diagnostics, planExpression, expectedTargetType);
  }
  if (isNullishEqualityOperand(operand, operatorToken, sourceFile, input, expectedTargetType)) {
    return { kind: "LiteralExpression", value: null };
  }
  return expectedType === undefined
    ? planExpression(operand, sourceFile, input, diagnostics)
    : planExpressionWithExpectedType(
        operand,
        sourceFile,
        input,
        diagnostics,
        expectedType,
        undefined,
        expectedTargetType,
      );
}

function isNullishEqualityOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  expectedTargetType: TargetTypeRef,
): boolean {
  if (operatorToken.kind !== "EqualsEqualsToken" && operatorToken.kind !== "ExclamationEqualsToken") {
    return false;
  }
  if (isCsharpRuntimeNullTargetType(expectedTargetType) || isCsharpRuntimeUndefinedTargetType(expectedTargetType)) {
    return false;
  }
  const kind = SourceKind(input.program.source.ast, operand);
  if (kind === KindNullKeyword) {
    return true;
  }
  if (kind !== KindIdentifier || Node_Text(input.program.source.ast, AsIdentifier(input.program.source.ast, operand)) !== "undefined") {
    return false;
  }
  const type = input.program.sourceEvidence.expressionType(operand);
  return type !== undefined &&
    input.program.sourceEvidence.semanticType(type, sourceFile)?.nullish === true;
}
