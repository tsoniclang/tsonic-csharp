import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../types/model.js";
import type { CsharpNativeBindingProperty } from "./value-projections.js";

export type CsharpPropertyProjectionMember = CsharpObjectShapeMemberFact | {
  readonly native: CsharpNativeBindingProperty;
  readonly sourceName: string;
};

export interface CsharpPropertyProjection {
  readonly source: TargetTypeRef;
  readonly members: readonly CsharpPropertyProjectionMember[];
}
