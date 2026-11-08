import type { TargetTypeRef } from "./native-type-data.js";

export type CsharpRuntimeParameterDefault = {
  readonly kind: "nullable" | "closed-value" | "present";
  readonly valueType: TargetTypeRef;
  readonly parameterType: TargetTypeRef;
};
