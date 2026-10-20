import type { CsharpSelectedTargetCall } from "./members.js";
import type { CsharpArraySpreadEmission } from "./array-literals.js";

export type CsharpRestSequence = NonNullable<CsharpSelectedTargetCall["sequenceArguments"]>[number];
export interface CsharpRestSequenceEmission {
  readonly spread: CsharpArraySpreadEmission;
  readonly direct: boolean;
}
export interface CsharpRestSequenceRecords {
  readonly restSequence: { readonly get: (sequence: CsharpRestSequence) => CsharpRestSequenceEmission | undefined };
}
