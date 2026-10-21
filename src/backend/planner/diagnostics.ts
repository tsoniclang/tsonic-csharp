import type { Node } from "@tsonic/tsts";
import { failTargetPlannerInvariant } from "@tsonic/target-api/artifacts";

export function failCsharpPlannerInvariant(message: string, sourceNode?: Node): never {
  return failTargetPlannerInvariant("tsonic-csharp", message, sourceNode);
}
