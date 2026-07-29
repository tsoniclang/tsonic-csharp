import type { CsharpTranslationContext } from "../../../translate/context/index.js";
import {
  AsIdentifier,
  KindIdentifier,
  KindNullKeyword,
  KindVoidExpression,
  Node_Text,
  SourceKind,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpBinaryOperatorToken,
  CsharpExpression,
} from "../../roslyn/syntax.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";

export function planBinaryOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  return isNullishEqualityOperand(operand, operatorToken, sourceFile, input)
    ? { kind: "LiteralExpression", value: null }
    : planExpression(operand, sourceFile, input, diagnostics);
}

function isNullishEqualityOperand(
  operand: Node,
  operatorToken: CsharpBinaryOperatorToken,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  if (operatorToken.kind !== "EqualsEqualsToken" && operatorToken.kind !== "ExclamationEqualsToken") {
    return false;
  }
  const kind = SourceKind(input.ast, operand);
  if (kind === KindNullKeyword || kind === KindVoidExpression) {
    return true;
  }
  if (kind !== KindIdentifier || Node_Text(input.ast, AsIdentifier(operand)) !== "undefined") {
    return false;
  }
  const type = input.queries(sourceFile).checker.getTypeAtLocation(operand);
  return type === undefined
    ? false
    : input.queries(sourceFile).typeShape.isNullish(type);
}
