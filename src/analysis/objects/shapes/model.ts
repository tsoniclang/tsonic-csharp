import type { CsharpObjectShapePolicy } from "../../../target-model/records/objects/object-shapes.js";

import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../../target-model/records/types/project-types.js";
import type { CsharpPlanningRepresentationQueries, CsharpRecursiveTypeResolver, CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpCurrentProjectDeclarations } from "../../source-evidence/model.js";
import type { CsharpProjectSemanticSource } from "../../source-evidence/types/resolution/project-types.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpCollectedObjectShapeMembers } from "./member-source.js";
import type { CsharpCompletedStructuralMemberChildren, CsharpStructuralMemberInheritance,
  CsharpStructuralTypeApplication, CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";

export type CsharpStructuralUnionResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "rejected" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef };

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly typeParameterConstraints: import("../../../target-model/types/generic-references.js").CsharpTypeParameterConstraintResolver;
  readonly representations: CsharpPlanningRepresentationQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  readonly projectDeclarations: CsharpCurrentProjectDeclarations;
  projectTypes(): CsharpProjectTypePolicy;
  readonly typeResolver: CsharpRecursiveTypeResolver;
  structuralTypeApplication(collection: CsharpCollectedObjectShapeMembers): CsharpStructuralTypeSource;
  bindStructuralTypeApplication(source: CsharpStructuralTypeSource, receiver: TargetTypeRef | undefined): CsharpStructuralTypeApplication;
  projectSemanticSource(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState): CsharpProjectSemanticSource;
}

export interface CsharpRecursiveObjectShapePolicy extends CsharpObjectShapePolicy {
  collectMembers(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node): CsharpCollectedObjectShapeMembers | undefined;
  memberInheritance(application: CsharpStructuralTypeApplication, memberIndex: number): CsharpStructuralMemberInheritance;
  completeMember(application: CsharpStructuralTypeApplication, memberIndex: number,
    children: CsharpCompletedStructuralMemberChildren): CsharpObjectShapeMemberFact | undefined;
  completeMembers(application: CsharpStructuralTypeApplication,
    members: readonly CsharpObjectShapeMemberFact[]): readonly CsharpObjectShapeMemberFact[];
  retainConstructionSource(node: Node, type: Type, shape: CsharpObjectShapeFact, sourceFile: SourceFile): CsharpObjectShapeFact | undefined;
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
