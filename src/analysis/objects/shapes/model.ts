import type { CsharpObjectShapePolicy } from "../../../target-model/records/objects/object-shapes.js";

import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectTypeABIPolicy, CsharpProjectTypeCatalog } from "../../../target-model/records/types/project-types.js";
import type { CsharpPlanningRepresentationQueries, CsharpRecursiveTypeResolver, CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpCurrentProjectDeclarations } from "../../source-evidence/model.js";
import type { CsharpProjectSemanticSource } from "../../source-evidence/types/resolution/project-types.js";
import type { CsharpAuthoredTypeSelectionEvidence } from "../../source-evidence/types/resolution/selected-values.js";
import type { CsharpProjectConstructionSource } from "./project-construction-source.js";
import type { CsharpProjectConstructibleTypeProjection } from "../../../target-model/records/objects/object-shapes.js";
import type { CsharpTypeResolutionServices } from "../../source-evidence/types/resolution/engine.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpCollectedObjectShapeMembers } from "./member-source.js";
import type { CsharpObjectShapeNodeSource } from "./node-source.js";
import type { CsharpObjectShapeTypeSource } from "./type-source.js";
import type { CsharpStructuralNodeSourceInput, CsharpStructuralTypeSourceInput } from "../../source-evidence/types/resolution/root-sources.js";
import type { CsharpNativeConstructionRetention } from "../native-construction-source.js";
import type { CsharpStructuralMemberInheritance,
  CsharpStructuralTypeApplication, CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";
import type { CsharpStructuralMembersHeader } from "./member-evidence.js";

export type CsharpStructuralUnionResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "rejected" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef };

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly typeParameterConstraints: import("../../../target-model/records/types/type-parameter-constraints.js").CsharpTypeParameterEnvironment;
  readonly representations: CsharpPlanningRepresentationQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  readonly projectDeclarations: CsharpCurrentProjectDeclarations;
  projectTypeABI(): CsharpProjectTypeABIPolicy;
  readonly typeResolver: CsharpRecursiveTypeResolver;
  structuralTypeApplication(collection: CsharpCollectedObjectShapeMembers): CsharpStructuralTypeSource;
  readonly structuralTypeCapture: CsharpTypeResolutionServices["structuralTypeCapture"];
  readonly bindStructuralTypeCapture: CsharpTypeResolutionServices["bindStructuralTypeCapture"];
  bindStructuralTypeApplication(source: CsharpStructuralTypeSource, receiver: TargetTypeRef | undefined): CsharpStructuralTypeApplication;
  projectSemanticSource(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState): CsharpProjectSemanticSource;
  completeAuthoredSelection(source: CsharpAuthoredTypeSelectionEvidence): TargetTypeRef | undefined;
}

export interface CsharpRecursiveObjectShapePolicy extends CsharpObjectShapePolicy {
  formNodeSource(node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState): CsharpObjectShapeNodeSource | undefined;
  completeNodeSource(input: CsharpStructuralNodeSourceInput): CsharpObjectShapeFact | undefined;
  formTypeSource(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node): CsharpObjectShapeTypeSource | undefined;
  completeTypeSource(input: CsharpStructuralTypeSourceInput): CsharpObjectShapeFact | undefined;
  collectMembers(type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node): CsharpCollectedObjectShapeMembers | undefined;
  memberInheritance(application: CsharpStructuralTypeApplication, memberIndex: number): CsharpStructuralMemberInheritance;
  completeMembers(application: CsharpStructuralTypeApplication,
    members: readonly CsharpObjectShapeMemberFact[]): readonly CsharpObjectShapeMemberFact[];
  formSourceMembersHeader(source: CsharpStructuralTypeSource,
    receiver: TargetTypeRef | undefined): CsharpStructuralMembersHeader | undefined;
  completeSourceMembers(header: CsharpStructuralMembersHeader): readonly CsharpObjectShapeMemberFact[] | undefined;
  formProjectConstructionSource(explicitTypeNode: Node | undefined, selectedType: Type,
    contextNode: Node, sourceFile: SourceFile): CsharpProjectConstructionSource;
  completeProjectConstructionSource(source: CsharpProjectConstructionSource,
    targetType: TargetTypeRef): CsharpProjectConstructibleTypeProjection;
  retainConstructionSource(source: CsharpNativeConstructionRetention<CsharpStructuralTypeSourceInput>,
    shape: CsharpObjectShapeFact): CsharpObjectShapeFact | undefined;
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
