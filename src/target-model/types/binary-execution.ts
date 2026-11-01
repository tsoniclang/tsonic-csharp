import type { TargetTypeRef } from "./model.js";

export interface CsharpTargetBinaryExecutionDriver {
  readonly id: string;
  readonly declaringType: TargetTypeRef;
  readonly runMethodName: string;
  readonly runWithEntrypointMethodName: string;
}
