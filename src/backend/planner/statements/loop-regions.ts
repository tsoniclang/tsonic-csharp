import type { Node } from "@tsonic/tsts";
import type { CsharpStatement } from "../../target-ast/syntax/index.js";
import { allocateControlLabel, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

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
  if (region?.loop !== loop) failCsharpPlannerInvariant("A planned loop region requires its exact active native continuation owner.", loop);
  const target = [...state.controlLabels].reverse().find(target => target.loop === loop);
  const label = target?.continueLabel ?? allocateControlLabel(state, "ContinueStatement");
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
  if (region?.loop !== loop) failCsharpPlannerInvariant("A loop continuation label requires its exact owning region.", loop);
  return region.used ? [{ kind: "LabeledStatement", name: label,
    statement: { kind: "Block", body: { kind: "Block", statements: [] } } }] : [];
}

export function finishCsharpLoopBody(
  body: Node,
  statements: readonly CsharpStatement[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const targets = state.controlLabels.filter(target => target.loopBody === body &&
    target.continueUsed === true && target.continueOwned !== true && target.continueLabel !== undefined);
  return targets.length === 0 ? statements : [...statements, ...targets.map((target): CsharpStatement => ({
    kind: "LabeledStatement", name: target.continueLabel!,
    statement: { kind: "Block", body: { kind: "Block", statements: [] } },
  }))];
}
