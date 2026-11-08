import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";

export interface CsharpIndexedRecordReadPolicyInput {
  readonly optional: boolean;
  readonly owner: TargetTypeRef | undefined;
  readonly value: TargetTypeRef | undefined;
}
