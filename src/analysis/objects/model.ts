import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeProjectionKind } from "../../target-model/types/model.js";
import type {
  CsharpObjectLiteralTargetShapeResolution,
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../policy/types/index.js";

export interface CsharpObjectShapeClassifications {
  propertyOrder(shape: CsharpObjectShapeFact, sourceValue: Node | undefined,
    projection: CsharpObjectShapeProjectionKind): CsharpObjectShapePropertyOrderSelection;
  assignmentSourceOrder(shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrderSelection;
  structuralImplementations(type: TargetTypeRef): readonly import("../../target-model/types/model.js").CsharpStructuralInterfaceImplementation[];
  knownShapes(): readonly CsharpObjectShapeFact[];
  methodImplementationHasCopies(shape: CsharpObjectShapeFact): boolean;
  resolveCopyShape(shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined;
  resolveObjectLiteralUnionCarrier(node: Node, type: TargetTypeRef): TargetTypeRef | undefined;
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

export type CsharpObjectShapePropertyOrderSelection =
  | { readonly kind: "resolved"; readonly propertyOrder: readonly string[] }
  | { readonly kind: "rejected"; readonly reason: string };
