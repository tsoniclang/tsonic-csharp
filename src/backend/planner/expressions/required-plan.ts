import type { Node } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function requireExpressionPlan<T>(
  node: Node,
  plan: () => T | undefined,
): T {
  const selected = plan();
  if (selected === undefined) failCsharpPlannerInvariant("An admitted C# expression requires its native completion.", node);
  return selected;
}
