import type { CsharpConversionSelection } from "../../conversions/selection.js";
import type { CsharpTypeParameterConstraintResolution } from "../../types/generic-constraints.js";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpSourceDefaultValue, CsharpSourceField, CsharpSourceStruct } from "./source-markers.js";
import type { Node } from "@tsonic/tsts";
import type { SourceGeneratorSelection, SourceTypeDescriptor, SourceYieldSelection } from "@tsonic/target-api/source";

/** WP0 A4: the frozen Source passing selection of one expression (its mode and exact storage occurrence). */
export interface CsharpSourceArgumentClassification {
  readonly passingMode: import("@tsonic/tsts").ArgumentPassingMode;
  readonly storageExpression: Node;
}

export type CsharpContextualTupleClassification =
  | {
      readonly kind: "selected";
      readonly elementTypes: readonly (TargetTypeRef | undefined)[];
      readonly optionalElementIndexes: readonly number[];
      readonly omittedOptionalElementIndexes: readonly number[];
    }
  | { readonly kind: "unavailable" };

export interface CsharpValueRefinementClassification {
  readonly kind: "resolved" | "unavailable";
  readonly exact: boolean;
  readonly selectedTargetType?: TargetTypeRef;
  readonly flowReadTargetType?: TargetTypeRef;
}

export type CsharpFlowReadProjection =
  | { readonly kind: "identity" }
  | { readonly kind: "non-null" }
  | { readonly kind: "conversion"; readonly source: TargetTypeRef; readonly target: TargetTypeRef;
      readonly selection: CsharpConversionSelection }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpFlowReadClassifications {
  readonly flowReadProjection: {
    readonly get: (node: Node) => Exclude<CsharpFlowReadProjection, { readonly kind: "rejected" }> | undefined;
  };
  readonly issues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
}

/** The contextual (destination) type of an expression: the Host descriptor and its represented carrier. */
/** The published contextual type of a node and its C# representation (C2 analyze.ts records this shape, R-C2-6). */
export interface CsharpContextualTypeEvidence {
  readonly type: SourceTypeDescriptor;
  readonly targetType: TargetTypeRef | undefined;
}

export interface CsharpSourceEvidenceIndex {
  readonly bindingProjection: { readonly get: (node: Node) => import("../storage/binding-projection-policy.js").CsharpBindingProjection | undefined };
  readonly memoryMetadataIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly fixedArrayIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly pointerBackingUses: readonly import("../storage/pointer-backing.js").CsharpPointerBackingUse[];
  readonly compileTimeMetadata: { readonly get: (node: Node) => boolean };
  readonly targetTypes: readonly TargetTypeRef[];
  readonly nodeTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly classConstructorType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly storageTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly readStorageTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly contextualType: { readonly get: (node: Node) => CsharpContextualTypeEvidence | undefined };
  readonly contextualTuple: { readonly get: (node: Node) => CsharpContextualTupleClassification | undefined };
  readonly constantValue: { readonly get: (node: Node) => { readonly value: unknown } | undefined };
  readonly valueRefinement: { readonly get: (node: Node) => CsharpValueRefinementClassification | undefined };
  readonly generator: { readonly get: (node: Node) => SourceGeneratorSelection | undefined };
  readonly generatorTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  /** The Host yield selection (generator declaration, value or delegate, operand, delegated iteration); absent when refused. */
  readonly yield: { readonly get: (node: Node) => SourceYieldSelection | undefined };
  readonly yieldTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  /** The well-known symbol a computed key or element access names (selections.wellKnownSymbol), as the C# member-key kind. */
  readonly wellKnownSymbol: { readonly get: (node: Node) => import("../../types/model.js").CsharpWellKnownSymbolKind | undefined };
  readonly inferredCallableReturnType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly pointerReturn: { readonly get: (node: Node) => import("../calls/pointer-return.js").CsharpPointerReturnContract | undefined };
  readonly sourceArgument: { readonly get: (node: Node) => CsharpSourceArgumentClassification | undefined };
  readonly sourceDefaultValue: { readonly get: (node: Node) => CsharpSourceDefaultValue | undefined };
  readonly sourceField: { readonly get: (subjects: readonly (Node | undefined)[]) => CsharpSourceField | undefined };
  readonly sourceStruct: { readonly get: (node: Node) => CsharpSourceStruct | undefined };
  readonly providerVirtualDeclaration: { readonly get: (node: Node) => boolean };
  readonly typeParameterConstraints: { readonly get: (node: Node) => CsharpTypeParameterConstraintResolution | undefined };
  readonly sourceOwnedProjectShape: { readonly get: (node: Node) => boolean | undefined };
}
