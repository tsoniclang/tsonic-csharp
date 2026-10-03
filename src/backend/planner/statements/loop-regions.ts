import type { Node } from "@tsonic/tsts";
import type { CsharpStatement } from "../../target-ast/roslyn/index.js";
import { allocateControlLabel, type DestructuringPlannerState } from "../bindings/binding-state.js";

export function withCsharpLoopContinuation(
  loop: Node,
  state: DestructuringPlannerState,
  plan: () => readonly CsharpStatement[],
): readonly CsharpStatement[] {
  state.loopContinuations.push({ loop, used: false });
  try {
    return plan();
  } finally {
    state.loopContinuations.pop();
  }
}

export function planCsharpLoopContinuation(
  loop: Node,
  state: DestructuringPlannerState,
): string {
  const region = state.loopContinuations[state.loopContinuations.length - 1];
  if (region?.loop !== loop) throw new Error("A planned loop region requires its exact active native continuation owner.");
  const target = [...state.controlLabels].reverse().find(target => target.loop === loop);
  const label = target?.continueLabel ?? allocateControlLabel(state, "region", "ContinueStatement");
  if (target !== undefined) target.continueOwned = true;
  region.label = label;
  return label;
}

export function csharpLoopContinuationLabel(
  loop: Node,
  label: string,
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const region = state.loopContinuations[state.loopContinuations.length - 1];
  if (region?.loop !== loop) throw new Error("A loop continuation label requires its exact owning region.");
  return region.used ? [{ kind: "LabeledStatement", name: label,
    statement: { kind: "Block", body: { kind: "Block", statements: [] } } }] : [];
}
