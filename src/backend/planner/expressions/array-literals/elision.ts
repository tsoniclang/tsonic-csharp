import type { CsharpPlanningContext } from "../../context.js";
import {
  AsArrayLiteralExpression,
  HasSourceKind,
  KindOmittedExpression,
} from "@tsonic/target-api/source";
import type {
  Node,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";

export function arrayLiteralHasElision(
  node: Node,
  input: CsharpPlanningContext,
): boolean {
  const literal = AsArrayLiteralExpression(input.program.source.ast, node);
  return (literal?.Elements?.Nodes ?? []).some((element) => HasSourceKind(input.program.source.ast, element, KindOmittedExpression));
}

export function rejectSparseArrayLiteralElision(
  node: Node,
  diagnostics: TargetDiagnostic[],
): undefined {
  diagnostics.push(unsupportedNodeDiagnostic(node, "Sparse array literal elisions require closed JSArray hole construction facts before C# emission; dense array carriers must not compact holes."));
  return undefined;
}
