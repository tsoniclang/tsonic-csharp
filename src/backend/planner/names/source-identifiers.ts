import type { CsharpPlanningContext } from "../context.js";

import type { Node } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planIdentifierName(
  node: Node | undefined,
  input: CsharpPlanningContext,
  description: string,
): string {
  if (node === undefined) {
    failCsharpPlannerInvariant(`An admitted ${description} requires its checked name node.`, node);
  }
  const resolution = input.program.records.sourceName.get(node);
  if (resolution.kind === "resolved") {
    return resolution.name;
  }
  return failCsharpPlannerInvariant(`An admitted ${description} requires its sealed native name. ${resolution.reason}`, node);
}
