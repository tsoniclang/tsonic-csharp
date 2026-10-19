import type { CsharpTypeResolutionState } from "./model.js";

export function nextState(
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  return { ...state, depth: state.depth + 1 };
}
