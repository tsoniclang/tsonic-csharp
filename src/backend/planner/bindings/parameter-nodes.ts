import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function plannedCsharpValueParameterNodes(
  nodes: readonly (Node | undefined)[], input: CsharpPlanningContext,
): readonly Node[] {
  const parameters: Node[] = [];
  for (const node of nodes) {
    if (node === undefined) failCsharpPlannerInvariant("An admitted callable requires its dense checked parameter list.");
    const selected = input.program.records.callableParameter.get(node)
      ?? failCsharpPlannerInvariant("An admitted callable parameter requires its sealed emission record.", node);
    if (selected.kind === "parameter") parameters.push(node);
  }
  return parameters;
}
