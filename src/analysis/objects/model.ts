import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  CsharpObjectLiteralTargetShapeResolution,
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";

export interface CsharpObjectShapeClassifications {
  structuralImplementations(type: TargetTypeRef): readonly import("../../target-model/types/model.js").CsharpStructuralInterfaceImplementation[];
  knownShapes(): readonly CsharpObjectShapeFact[];
  resolveCopyShape(shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined;
  resolveObjectLiteralUnionShape(node: Node, type: TargetTypeRef): CsharpObjectShapeFact | undefined;
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
