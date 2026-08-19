import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.objectShapes.resolveNode(node, sourceFile);
}

export function getCsharpObjectShapeFactForTargetType(
  targetType: TargetTypeRef | undefined,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.objectShapes.resolveTarget(targetType);
}
