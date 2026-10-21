import type { Node } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function requireExpressionPlan<T>(
  node: Node,
  plan: () => T | undefined,
): T {
  const selected = plan();
  if (selected === undefined) failCsharpPlannerInvariant("An admitted C# expression requires its native completion.", node);
  return selected;
}
