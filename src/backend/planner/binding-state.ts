import { sanitizeIdentifier } from "./identifiers.js";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import type { Node } from "@tsonic/tsts";

export interface DestructuringPlannerState {
  nextTempIndex: number;
  nextParameterIndex: number;
  nextForOfIndex: number;
  nextForInIndex: number;
  nextCatchIndex: number;
  nextControlLabelIndex: number;
  controlLabels: ControlLabelTarget[];
  currentReturnType?: CsharpTypeNode;
  currentReturnTypeSubject?: Node;
}

export interface ControlLabelTarget {
  readonly sourceName: string;
  readonly breakLabel: string;
  readonly continueLabel?: string;
}

export function createDestructuringPlannerState(): DestructuringPlannerState {
  return {
    nextTempIndex: 0,
    nextParameterIndex: 0,
    nextForOfIndex: 0,
    nextForInIndex: 0,
    nextCatchIndex: 0,
    nextControlLabelIndex: 0,
    controlLabels: [],
  };
}

export function allocateSyntheticParameter(state: DestructuringPlannerState): string {
  const name = `__param${state.nextParameterIndex}`;
  state.nextParameterIndex += 1;
  return name;
}

export function allocateForOfItem(state: DestructuringPlannerState): string {
  const name = `__forOf${state.nextForOfIndex}`;
  state.nextForOfIndex += 1;
  return name;
}

export function allocateForOfLoop(state: DestructuringPlannerState): number {
  const index = state.nextForOfIndex;
  state.nextForOfIndex += 1;
  return index;
}

export function allocateForInIndex(state: DestructuringPlannerState): string {
  const name = `__forInIndex${state.nextForInIndex}`;
  state.nextForInIndex += 1;
  return name;
}

export function allocateCatchValue(state: DestructuringPlannerState): string {
  const name = `__catch${state.nextCatchIndex}`;
  state.nextCatchIndex += 1;
  return name;
}

export function allocateControlLabel(
  state: DestructuringPlannerState,
  sourceName: string,
  purpose: "BreakStatement" | "ContinueStatement",
): string {
  const suffix = purpose === "BreakStatement" ? "break" : "continue";
  const name = `__label${state.nextControlLabelIndex}_${sourceName}_${suffix}`;
  state.nextControlLabelIndex += 1;
  return sanitizeIdentifier(name);
}

export function allocateDestructuringTemp(state: DestructuringPlannerState): string {
  const name = `__destructure${state.nextTempIndex}`;
  state.nextTempIndex += 1;
  return name;
}
