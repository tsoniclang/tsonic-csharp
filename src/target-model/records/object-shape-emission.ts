import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";
import type { CsharpTypeParameterConstraint } from "../types/generic-constraints.js";

export interface CsharpObjectShapeParameter {
  readonly parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
  readonly name: string;
  readonly constraints: readonly CsharpTypeParameterConstraint[];
  readonly variance: "out" | undefined;
}

export interface CsharpObjectShapeEmissionRecords {
  readonly objectShapeParameters: { readonly get: (fact: CsharpObjectShapeFact) => readonly CsharpObjectShapeParameter[] | undefined };
  readonly enumerableKeys: { readonly get: (fact: CsharpObjectShapeFact) => readonly string[] | undefined };
}
