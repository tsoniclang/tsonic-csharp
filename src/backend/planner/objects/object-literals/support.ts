import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../../target-model/types/model.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function getCsharpObjectLiteralMember(
  shape: CsharpObjectShapeFact,
  property: Node,
  input: CsharpPlanningContext,
): CsharpObjectShapeMemberFact {
  const selected = input.program.records.objectLiteralMember.get(shape, property);
  if (selected === undefined || selected.kind === "spread") failCsharpPlannerInvariant(
    "An admitted object initializer requires its sealed source-member correspondence.", property);
  return selected.member;
}
