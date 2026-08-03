import type { CsharpTranslationContext } from "../../../translate/context/index.js";
import {
  AsArrayLiteralExpression,
  HasSourceKind,
  KindOmittedExpression,
} from "../source-ast.js";
import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";

export function arrayLiteralHasElision(
  node: Node,
  input: CsharpTranslationContext,
): boolean {
  const literal = AsArrayLiteralExpression(node);
  return (literal?.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.ast, element, KindOmittedExpression));
}

export function rejectSparseArrayLiteralElision(
  node: Node,
  diagnostics: TargetDiagnostic[],
): undefined {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Sparse array literal elisions require closed JSArray hole construction facts before C# emission; dense array carriers must not compact holes."));
  return undefined;
}
