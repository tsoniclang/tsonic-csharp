import type { TargetTypeRef } from "./model.js";
import type { CsharpUnionPathStep } from "./union-relations.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";

export interface CsharpAwaitAlternative {
  readonly resultForm: "void" | "absence" | "value";
  readonly carrier: TargetTypeRef;
  readonly sourcePath: readonly CsharpUnionPathStep[];
  readonly result: TargetTypeRef;
  readonly task: boolean;
  readonly resultPath: readonly CsharpUnionPathStep[];
  readonly resultMapping?: Extract<CsharpConversionSelection, { readonly kind: "union-map" }>;
}

export interface CsharpAwaitCompletion {
  readonly form: "identity" | "direct" | "void-branches" | "branches" | "task-test";
  readonly discard: boolean;
  readonly excludeUnmatched: boolean;
  readonly result: TargetTypeRef;
  readonly alternatives: readonly CsharpAwaitAlternative[];
  readonly optional: boolean;
  readonly adoption?: {
    readonly native: CsharpAwaitCompletion;
    readonly continuation: CsharpAwaitCompletion;
  };
}
