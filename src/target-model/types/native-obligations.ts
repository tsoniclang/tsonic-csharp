import type { Node } from "@tsonic/tsts";
import type { SourceConstruction, SourcePresence, SourceTypeEvidence, SourceTypeParameter } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "./native-type-data.js";
import type { TargetConstraint } from "./model.js";

export interface CsharpNativeTypeValue {
  readonly evidence: SourceTypeEvidence;
  readonly carrier: TargetTypeRef;
}

export interface CsharpNativeTypeEndpoints {
  readonly source: CsharpNativeTypeValue;
  readonly destination: CsharpNativeTypeValue;
}

export type CsharpNativeConstructionReceipt =
  | { readonly kind: "aggregate"; readonly carrier: TargetTypeRef }
  | { readonly kind: "array"; readonly carrier: TargetTypeRef;
      readonly construction: SourceConstruction;
      readonly contributions: readonly {
        readonly original: SourceConstruction["evaluation"][number];
        readonly elements: readonly (CsharpNativeTypeEndpoints & { readonly site: Node })[];
      }[] };

export type CsharpNativeTypeObligation = { readonly site: Node } & (
  | CsharpNativeTypeEndpoints & { readonly kind: "write-fit" | "contract" }
  | CsharpNativeTypeEndpoints & { readonly kind: "literal-admission";
      readonly construction: SourcePresence<CsharpNativeConstructionReceipt> }
  | { readonly kind: "constraint"; readonly source: CsharpNativeTypeValue;
      readonly parameter: SourceTypeParameter; readonly constraints: readonly TargetConstraint[] }
);
