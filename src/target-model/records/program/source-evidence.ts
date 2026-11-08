import type { CsharpConversionSelection } from "../../conversions/selection.js";
import type { CsharpTypeParameterConstraintResolution, TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpSourceDefaultValue, CsharpSourceField, CsharpSourceStruct } from "./source-markers.js";
import type { SourcePresence, SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome } from "../../types/representation.js";
import type { Node, ResolvedSourceGeneratorInfo, ResolvedSourceWellKnownSymbolInfo, ResolvedSourceYieldInfo, Signature } from "@tsonic/tsts";

export interface CsharpSourceArgumentClassification {
  readonly kind: "resolved";
  readonly argument: {
    readonly passingMode: import("@tsonic/tsts").ArgumentPassingMode;
    readonly storageExpression: Node;
  };
}

export type CsharpContextualTupleClassification =
  | {
      readonly kind: "selected";
      readonly elementTypes: readonly (TargetTypeRef | undefined)[];
      readonly optionalElementIndexes: readonly number[];
      readonly omittedOptionalElementIndexes: readonly number[];
    }
  | { readonly kind: "unavailable" };

export type CsharpValueRefinementClassification = CsharpRepresentationOutcome<{
  readonly occurrence: Node;
  readonly exact: boolean;
  readonly selected: { readonly evidence: SourceTypeEvidence; readonly carrier: TargetTypeRef };
  readonly storage: SourcePresence<{ readonly evidence: SourceTypeEvidence; readonly carrier: TargetTypeRef }>;
}>;

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
  readonly issues: readonly { readonly node: Node; readonly code: string; readonly message: string; readonly source?: string }[];
}

export interface CsharpContextualTypeEvidence {
  readonly evidence: SourceTypeEvidence;
  readonly targetType: TargetTypeRef;
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
  readonly signatureDeclaration: { readonly get: (signature: Signature) => Node | undefined };
  readonly contextualTuple: { readonly get: (node: Node) => CsharpContextualTupleClassification | undefined };
  readonly constantValue: { readonly get: (node: Node) => { readonly value: unknown } | undefined };
  readonly valueRefinement: { readonly get: (node: Node) => CsharpValueRefinementClassification | undefined };
  readonly generator: { readonly get: (node: Node) => ResolvedSourceGeneratorInfo | undefined };
  readonly generatorTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly yield: { readonly get: (node: Node) => ResolvedSourceYieldInfo | undefined };
  readonly yieldTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly wellKnownSymbol: { readonly get: (node: Node) => ResolvedSourceWellKnownSymbolInfo | undefined };
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
