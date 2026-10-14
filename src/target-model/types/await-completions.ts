import type { TargetTypeRef } from "./model.js";
import type { CsharpUnionPathStep } from "./union-relations.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";

export interface CsharpAwaitAlternative {
  readonly carrier: TargetTypeRef;
  readonly sourcePath: readonly CsharpUnionPathStep[];
  readonly result: TargetTypeRef;
  readonly task: boolean;
  readonly resultPath: readonly CsharpUnionPathStep[];
  readonly resultMapping?: Extract<CsharpConversionSelection, { readonly kind: "union-map" }>;
}

export interface CsharpAwaitCompletion {
  readonly result: TargetTypeRef;
  readonly alternatives: readonly CsharpAwaitAlternative[];
  readonly optional: boolean;
}
