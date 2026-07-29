import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";

export function getCsharpObjectShapeFactForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): CsharpObjectShapeFact | undefined {
  return input.objectShapes.resolveNode(node, sourceFile);
}

export function getCsharpObjectShapeFactForTargetType(
  targetType: TargetTypeRef | undefined,
  input: CsharpTranslationContext,
): CsharpObjectShapeFact | undefined {
  return input.objectShapes.resolveTarget(targetType);
}
