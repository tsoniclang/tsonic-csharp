import type { TargetTypeRef } from "../types/model.js";
import type { CsharpUnionPathStep } from "../types/union-relations.js";

export interface CsharpReferenceEquality {
  readonly kind: "reference-identity";
  readonly negated: boolean;
  readonly distinctMethodValues?: true;
}

export interface CsharpUnionEqualityArm {
  readonly left: { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] };
  readonly right: { readonly carrier: TargetTypeRef; readonly path: readonly CsharpUnionPathStep[] };
  readonly operation: CsharpReferenceEquality | {
    readonly kind: "operator";
    readonly leftInputType: TargetTypeRef;
    readonly rightInputType: TargetTypeRef;
  };
}
