import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpReturnCompletion {
  readonly kind: "value" | "void" | "absence";
  readonly target: TargetTypeRef | undefined;
}
