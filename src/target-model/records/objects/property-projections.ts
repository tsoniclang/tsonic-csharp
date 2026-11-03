import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../types/model.js";
import type { CsharpNativePropertyRead } from "../program/source-profile-invocations.js";

export type CsharpPropertyProjectionMember = (CsharpObjectShapeMemberFact & { readonly native?: never }) |
  { readonly native: CsharpNativePropertyRead; readonly sourceName: string };

export interface CsharpPropertyProjection {
  readonly source: TargetTypeRef;
  readonly members: readonly CsharpPropertyProjectionMember[];
}
