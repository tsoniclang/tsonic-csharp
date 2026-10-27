import type { TargetTypeRef } from "./model.js";

export type CsharpRuntimeParameterDefault = {
  readonly kind: "nullable" | "closed-value" | "present";
  readonly valueType: TargetTypeRef;
  readonly parameterType: TargetTypeRef;
};
