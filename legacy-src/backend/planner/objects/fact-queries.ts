import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.types.objectShapes.resolveNode(node, sourceFile);
}

export function getCsharpObjectShapeFactForTargetType(
  targetType: TargetTypeRef | undefined,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.types.objectShapes.resolveTarget(targetType);
}
