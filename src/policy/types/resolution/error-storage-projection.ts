import type { SourceErrorStorageProjection } from "@tsonic/target-api/analysis";
import type { CsharpTypeResolutionState } from "./model.js";

export function csharpSourceErrorComponentState(
  state: CsharpTypeResolutionState,
  component: SourceErrorStorageProjection,
): CsharpTypeResolutionState {
  return { ...state, sourceValueProjection: [...state.sourceValueProjection ?? [], component] };
}
