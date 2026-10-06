import type { SourceStorageProjection } from "@tsonic/target-api/analysis";
import type { CsharpTypeResolutionState } from "./model.js";

export function csharpSourceErrorComponentState(
  state: CsharpTypeResolutionState,
  component: SourceStorageProjection,
): CsharpTypeResolutionState {
  return { ...state, sourceValueProjection: [...state.sourceValueProjection ?? [], component] };
}
