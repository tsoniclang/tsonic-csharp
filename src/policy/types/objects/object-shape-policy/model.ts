import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpSourceMemberKey,
  TargetTypeRef,
} from "../../../../target-model/types/model.js";
import type { CsharpProjectTypeCatalog } from "../../project/project-types.js";
import type {
  CsharpPlanningRepresentationQueries,
  CsharpRecursiveTypeResolver,
  CsharpTypePolicyBaseHost,
  CsharpTypeResolutionState,
} from "../../resolution/model.js";

export type CsharpStructuralUnionResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "rejected" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef };

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly representations: CsharpPlanningRepresentationQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  readonly typeResolver: CsharpRecursiveTypeResolver;
}

export interface CsharpObjectShapePolicy {
  resolveCopyShape(shape: CsharpObjectShapeFact): CsharpObjectShapeFact;
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

export interface CsharpRecursiveObjectShapePolicy extends CsharpObjectShapePolicy {
  resolveReference(type: Type): TargetTypeRef | undefined;
  resolveUnion(type: Type, sourceFile: SourceFile, state: CsharpTypeResolutionState): CsharpStructuralUnionResolution;
  resolveNodeWithState(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined;
  resolveTypeWithState(
    type: Type | undefined,
    sourceFile: SourceFile,
    authoredTypeRoot: Node | undefined,
    state: CsharpTypeResolutionState,
  ): CsharpObjectShapeFact | undefined;
}

export type CsharpObjectLiteralTargetShapeResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | {
      readonly kind: "rejected";
      readonly subject: Node;
      readonly reason: string;
    };

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };
