import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpSourceMemberName(node: Node, methodValue: boolean, input: CsharpPlanningContext): string {
  const selected = input.program.records.sourceMemberName.get(node);
  const name = methodValue ? selected?.method : selected?.read;
  return name ?? failCsharpPlannerInvariant("An admitted source property requires its exact native declaration or stored-method name.", node);
}
