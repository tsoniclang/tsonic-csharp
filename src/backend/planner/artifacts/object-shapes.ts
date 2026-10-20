import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import { objectShapeArtifactKey } from "../../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeArtifact } from "../../../target-model/records/object-shape-demand.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function csharpObjectShapeArtifact(input: CsharpPlanningContext, fact: CsharpObjectShapeFact): CsharpObjectShapeArtifact {
  return input.program.records.objectShapeArtifact.get(objectShapeArtifactKey(fact))
    ?? failCsharpPlannerInvariant("An admitted native shape requires its sealed artifact record.");
}
