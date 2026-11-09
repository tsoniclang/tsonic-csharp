import type { CsharpConversionSelection } from "../../conversions/selection.js";
import type { CsharpTypeParameterConstraintResolution, TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpSourceDefaultValue, CsharpSourceField, CsharpSourceStruct } from "./source-markers.js";
import type { SourceGenerator, SourcePresence, SourceTypeEvidence, SourceYield } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome } from "../../types/representation.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpSourceArgumentClassification {
  readonly kind: "resolved";
  readonly argument: {
    readonly passingMode: import("@tsonic/tsts").ArgumentPassingMode;
    readonly storageExpression: Node;
  };
}

export type CsharpValueRefinementClassification = CsharpRepresentationOutcome<{
  readonly occurrence: Node;
  readonly selected: { readonly evidence: SourceTypeEvidence; readonly carrier: TargetTypeRef };
  readonly storage: SourcePresence<SourceTypeEvidence>;
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
  readonly memoryMetadataIssues: readonly { readonly node: Node; readonly code: string; readonly message: string }[];
  readonly pointerBackingUses: readonly import("../storage/pointer-backing.js").CsharpPointerBackingUse[];
  readonly compileTimeMetadata: { readonly get: (node: Node) => boolean };
  readonly targetTypes: readonly TargetTypeRef[];
  readonly nodeTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly storageTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly contextualType: { readonly get: (node: Node) => CsharpContextualTypeEvidence | undefined };
  readonly constantValue: { readonly get: (node: Node) => { readonly value: bigint | string } | undefined };
  readonly valueRefinement: { readonly get: (node: Node) => CsharpValueRefinementClassification | undefined };
  readonly generator: { readonly get: (node: Node) => SourceGenerator | undefined };
  readonly generatorTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly yield: { readonly get: (node: Node) => SourceYield | undefined };
  readonly yieldTargetType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly inferredCallableReturnType: { readonly get: (node: Node) => TargetTypeRef | undefined };
  readonly pointerReturn: { readonly get: (node: Node) => import("../calls/pointer-return.js").CsharpPointerReturnContract | undefined };
  readonly sourceArgument: { readonly get: (node: Node) => CsharpSourceArgumentClassification | undefined };
  readonly sourceDefaultValue: { readonly get: (node: Node) => CsharpSourceDefaultValue | undefined };
  readonly sourceField: { readonly get: (node: Node) => CsharpSourceField | undefined };
  readonly sourceStruct: { readonly get: (node: Node) => CsharpSourceStruct | undefined };
  readonly typeParameterConstraints: { readonly get: (node: Node) => CsharpTypeParameterConstraintResolution | undefined };
}
