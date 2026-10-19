import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpObjectLiteralCallablePolicyInput {
  readonly carrier: TargetTypeRef;
  readonly storage: TargetTypeRef;
  readonly receiver: TargetTypeRef | undefined;
}
