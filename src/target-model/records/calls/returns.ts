import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpReturnCompletion {
  readonly kind: "value" | "void" | "absence";
  readonly target: TargetTypeRef | undefined;
}
