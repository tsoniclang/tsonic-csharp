import type { Node } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  AsBinaryExpression,
  HasSourceKind,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindEqualsToken,
  KindObjectLiteralExpression,
  SourceKind,
  SourceTokenKind,
} from "./source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export const missingDestructuringAssignmentFactsMessage = "Destructuring assignment emission requires finalized target storage and extraction facts before C# emission.";

export function isDestructuringAssignmentExpression(
  node: Node | undefined,
  input: TargetCompileInput,
): boolean {
  if (!HasSourceKind(input.ast, node, KindBinaryExpression)) {
    return false;
  }
  const expression = AsBinaryExpression(node);
  if (sourceTokenKind(expression?.OperatorToken, input) !== KindEqualsToken) {
    return false;
  }
  const left = expression?.Left;
  return HasSourceKind(input.ast, left, KindArrayLiteralExpression) ||
    HasSourceKind(input.ast, left, KindObjectLiteralExpression);
}

export function pushMissingDestructuringAssignmentFactsDiagnostic(
  node: Node,
  diagnostics: TargetDiagnostic[],
): void {
  diagnostics.push(unsupportedNodeDiagnostic(node, missingDestructuringAssignmentFactsMessage));
}

function sourceTokenKind(
  token: unknown,
  input: TargetCompileInput,
): string {
  return typeof token === "number"
    ? SourceTokenKind(input.ast, token)
    : SourceKind(input.ast, token as Node | undefined);
}
