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
  return input.program.records.nodeObjectShape.get(node, sourceFile);
}

export function getCsharpObjectShapeFactForTargetType(
  targetType: TargetTypeRef | undefined,
  input: CsharpPlanningContext,
): CsharpObjectShapeFact | undefined {
  return input.program.records.targetObjectShape.get(targetType);
}
