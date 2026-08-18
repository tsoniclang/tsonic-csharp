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
} from "../../../roslyn/syntax.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import type {
  TargetTypeRef,
} from "../../../../policy/types/index.js";

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
  if (isNullishEqualityOperand(operand, operatorToken, sourceFile, input)) {
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
): boolean {
  if (operatorToken.kind !== "EqualsEqualsToken" && operatorToken.kind !== "ExclamationEqualsToken") {
    return false;
  }
  const kind = SourceKind(input.ast, operand);
  if (kind === KindNullKeyword || kind === KindVoidExpression) {
    return true;
  }
  if (kind !== KindIdentifier || Node_Text(input.ast, AsIdentifier(input.ast, operand)) !== "undefined") {
    return false;
  }
  const type = input.semantics(sourceFile).getTypeAtLocation(operand);
  return type === undefined
    ? false
    : input.semantics(sourceFile).isNullish(type);
}
