import {
  SourceTokenKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  getProviderOperationOwnership,
} from "./semantic-guards.js";

export function getSourceOwnedUnaryOperator(
  operatorKind: unknown,
  operand: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): string | undefined {
  if (!getProviderOperationOwnership(operand, sourceFile, input).sourceOwned) {
    return undefined;
  }
  switch (SourceTokenKind(input.ast, operatorKind)) {
    case "KindPlusPlusToken":
      return "++";
    case "KindMinusMinusToken":
      return "--";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindExclamationToken":
      return "!";
    default:
      return undefined;
  }
}

export function getUnaryOperatorKind(expression: { readonly Operator?: unknown; readonly OperatorToken?: Node | undefined }): unknown {
  return expression.Operator ?? expression.OperatorToken?.Kind;
}
