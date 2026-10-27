import type { CsharpObjectShapePolicy } from "../../../target-model/records/objects/object-shapes.js";

import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectTypeCatalog, CsharpProjectTypePolicy } from "../../../target-model/records/types/project-types.js";
import type { CsharpPlanningRepresentationQueries, CsharpRecursiveTypeResolver, CsharpTypePolicyBaseHost, CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";

export type CsharpStructuralUnionResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "rejected" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef };

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly typeParameterConstraints: import("../../../target-model/types/generic-references.js").CsharpTypeParameterConstraintResolver;
  readonly representations: CsharpPlanningRepresentationQueries;
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  projectTypes(): CsharpProjectTypePolicy;
  readonly typeResolver: CsharpRecursiveTypeResolver;
}

export interface CsharpRecursiveObjectShapePolicy extends CsharpObjectShapePolicy {
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
