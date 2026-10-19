import type { TargetTypeRef } from "../types/model.js";

export interface CsharpLocalBindingCompletion {
  readonly carrier: TargetTypeRef;
  readonly initialization: "source" | "absence" | "declaration";
  readonly refKind: "ref" | "ref-readonly" | undefined;
  readonly recursiveInitializer: boolean;
}
