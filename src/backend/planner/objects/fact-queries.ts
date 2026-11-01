import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.program.records.nodeObjectShape.get(node, sourceFile);
}
