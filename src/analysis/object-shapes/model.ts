import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  CsharpObjectLiteralTargetShapeResolution,
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";

export interface CsharpObjectShapeClassifications {
  resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined;
  resolveTarget(
    type: TargetTypeRef | undefined,
  ): CsharpObjectShapeFact | undefined;
  resolveObjectLiteralTargetShape(
    expectedShape: CsharpObjectShapeFact | undefined,
    objectLiteral: Node,
    sourceFile?: SourceFile,
  ): CsharpObjectLiteralTargetShapeResolution | undefined;
}
