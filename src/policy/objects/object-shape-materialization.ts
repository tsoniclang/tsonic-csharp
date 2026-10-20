import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import { isSourceDeclaredNominalShape } from "../../target-model/types/object-shape-projection.js";

export function objectShapeMaterialization(fact: CsharpObjectShapeFact): "source" | "synthetic" {
  return fact.constructible === true || isSourceDeclaredNominalShape(fact) ? "source" : "synthetic";
}
