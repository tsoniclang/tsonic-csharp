import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpObjectShapeRecords {
  readonly nodeObjectShape: { readonly get: (node: Node | undefined, sourceFile?: SourceFile) => CsharpObjectShapeFact | undefined };
  readonly targetObjectShape: { readonly get: (carrier: TargetTypeRef | undefined) => CsharpObjectShapeFact | undefined };
}
import type { CsharpObjectShapeProjectionKind } from "../types/model.js";
import type { CsharpProjectTypeIssue } from "./project-types.js";

export type CsharpObjectLiteralTargetShapeResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly subject: Node; readonly reason: string };

export interface CsharpObjectShapeClassifications<StructuralImplementation = import("../types/model.js").CsharpStructuralInterfaceImplementation> {
  propertyOrder(shape: CsharpObjectShapeFact, sourceValue: Node | undefined,
    projection: CsharpObjectShapeProjectionKind): CsharpObjectShapePropertyOrderSelection;
  assignmentSourceOrder(shape: CsharpObjectShapeFact): CsharpObjectShapePropertyOrderSelection;
  structuralImplementations(type: TargetTypeRef): readonly StructuralImplementation[];
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

export interface CsharpObjectShapeAnalysis extends CsharpObjectShapeClassifications {
  readonly issues: readonly CsharpProjectTypeIssue[];
  readonly structuralImplementationTypes: readonly TargetTypeRef[];
  readonly targetShapes: Readonly<Record<string, CsharpObjectShapeFact>>;
}

export type CsharpObjectShapePropertyOrderSelection =
  | { readonly kind: "resolved"; readonly propertyOrder: readonly string[] }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpObjectShapeAuthoredOrder = CsharpObjectShapePropertyOrderSelection | { readonly kind: "empty" };

export interface CsharpObjectShapePropertyOrders {
  readonly projections: Readonly<Record<CsharpObjectShapeProjectionKind, CsharpObjectShapeAuthoredOrder>>;
  readonly assignmentSource: CsharpObjectShapePropertyOrderSelection;
}
