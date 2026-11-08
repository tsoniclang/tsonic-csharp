import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";

export interface CsharpObjectLiteralCallablePolicyInput {
  readonly carrier: TargetTypeRef;
  readonly storage: TargetTypeRef;
  readonly receiver: TargetTypeRef | undefined;
}
