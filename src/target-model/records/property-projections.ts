import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";

export interface CsharpPropertyProjection {
  readonly source: TargetTypeRef;
  readonly members: readonly CsharpObjectShapeMemberFact[];
}
