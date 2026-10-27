import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpSourceMemberKey, TargetTypeRef } from "../../types/model.js";

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpObjectShapeRecords {
  readonly nodeObjectShape: { readonly get: (node: Node | undefined, sourceFile?: SourceFile) => CsharpObjectShapeFact | undefined };
  readonly targetObjectShape: { readonly get: (carrier: TargetTypeRef | undefined) => CsharpObjectShapeFact | undefined };
}
import type { CsharpObjectShapeProjectionKind } from "../../types/model.js";
import type { CsharpProjectTypeIssue } from "../types/project-types.js";

export type CsharpObjectLiteralTargetShapeResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly subject: Node; readonly reason: string };

export interface CsharpObjectShapeClassifications<StructuralImplementation = import("../../types/model.js").CsharpStructuralInterfaceImplementation> {
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

export type CsharpNativeSourceCarrierSelection =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "rejected"; readonly subject: Node; readonly code: string; readonly reason: string; readonly type?: never };

export interface CsharpObjectShapePolicy {
  resolveNativeParameter(declaration: Node, parameter: Node, type: TargetTypeRef): CsharpNativeSourceCarrierSelection;
  resolveNativeReturn(declaration: Node, type: TargetTypeRef, observed: readonly TargetTypeRef[]): CsharpNativeSourceCarrierSelection;
  resolveCallableValue(signature: TargetTypeRef,
    typeParameters: NonNullable<CsharpObjectShapeMemberFact["typeParameters"]>): TargetTypeRef | undefined;
  resolveCopyShape(shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined;
  resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined;
  resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeFact | undefined;
  resolveTypeMember(
    type: Type | undefined,
    sourceFile: SourceFile,
    sourceKey: CsharpSourceMemberKey,
  ): CsharpObjectShapeMemberFact | undefined;
  resolveObjectLiteralTargetShape(
    expectedShape: CsharpObjectShapeFact | undefined,
    objectLiteral: Node,
    sourceFile: SourceFile,
  ): CsharpObjectLiteralTargetShapeResolution;
  resolveProjectConstructibleSelectedType(
    targetType: TargetTypeRef,
    explicitTypeNode: Node | undefined,
    selectedType: Type,
    contextNode: Node,
    sourceFile: SourceFile,
  ): CsharpProjectConstructibleTypeProjection;
}
