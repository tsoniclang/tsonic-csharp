import assert from "node:assert/strict";
import test from "node:test";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { withCsharpLoopContinuation, planCsharpLoopContinuation, csharpLoopContinuationLabel } from "../../../../dist/backend/planner/statements/loop-regions.js";

test("planned native continuation ownership is lexical and restored after failure", () => {
  const state = createDestructuringPlannerState();
  const outer = {};
  const inner = {};
  withCsharpLoopContinuation(outer, state, () => {
    const label = planCsharpLoopContinuation(outer, state);
    assert.throws(() => planCsharpLoopContinuation(inner, state), /exact active/);
    withCsharpLoopContinuation(inner, state, () => {
      assert.equal(state.loopContinuations.at(-1).label, undefined);
      assert.throws(() => csharpLoopContinuationLabel(outer, label, state), /exact owning/);
      return [];
    });
    assert.equal(state.loopContinuations.at(-1).label, label);
    return [];
  });
  assert.deepEqual(state.loopContinuations, []);
  assert.throws(() => withCsharpLoopContinuation(outer, state, () => { throw new Error("failure"); }), /failure/);
  assert.deepEqual(state.loopContinuations, []);
});

test("continue labels reuse the exact authored loop target and only emit when referenced", () => {
  const state = createDestructuringPlannerState();
  const loop = {};
  const target = { sourceName: "user", loop, breakLabel: "userBreak", continueLabel: "userContinue" };
  state.controlLabels.push(target);
  withCsharpLoopContinuation(loop, state, () => {
    const label = planCsharpLoopContinuation(loop, state);
    assert.equal(label, "userContinue");
    assert.equal(target.continueOwned, true);
    assert.deepEqual(csharpLoopContinuationLabel(loop, label, state), []);
    state.loopContinuations.at(-1).used = true;
    assert.deepEqual(csharpLoopContinuationLabel(loop, label, state).map(statement => statement.name), [label]);
    return [];
  });
});
