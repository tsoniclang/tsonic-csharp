import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function requireExpressionPlan<T>(
  node: Node,
  diagnostics: TargetDiagnostic[],
  plan: () => T | undefined,
): T | undefined {
  const initialDiagnosticCount = diagnostics.length;
  const selected = plan();
  if (selected === undefined && !diagnostics.slice(initialDiagnosticCount).some(diagnostic => diagnostic.category === "error")) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Required C# expression planning produced neither a native completion nor an error."));
  }
  return selected;
}
