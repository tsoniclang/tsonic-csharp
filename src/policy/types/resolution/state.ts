import type { CsharpTypeResolutionState } from "./model.js";

export function nextState(
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  return { depth: state.depth + 1 };
}
