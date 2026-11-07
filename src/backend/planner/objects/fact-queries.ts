import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.program.records.nodeObjectShape.get(node);
}
