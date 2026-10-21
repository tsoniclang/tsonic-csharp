import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function createCsharpTypeParameterPlanningContext(
  owner: Node,
  input: CsharpPlanningContext,
): CsharpPlanningContext {
  const typeParameterNames = input.program.records.projectTypeParameterNames.get(owner);
  if (typeParameterNames === undefined) failCsharpPlannerInvariant("An admitted native generic scope requires its sealed names.", owner);
  if (typeParameterNames.length === 0) return input;
  return { ...input, scope: { ...input.scope,
    typeParameterNames: new Map([...input.scope.typeParameterNames ?? [], ...typeParameterNames]),
  } };
}
