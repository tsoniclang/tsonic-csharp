import assert from "node:assert/strict";
import test from "node:test";
import { allocateSyntheticParameter, allocateUnusedParameter, createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";

test("one binding allocator preserves authored names, unused slots and synthetic counters", () => {
  const state = createDestructuringPlannerState();
  for (const name of ["unused", "unused1", "__tsonic_param0", "_"]) state.usedNames.add(name);
  assert.equal(allocateUnusedParameter(state), "unused2");
  assert.equal(allocateUnusedParameter(state), "unused3");
  assert.equal(state.nextParameterIndex, 0, "unused slots do not advance synthetic storage counters");
  assert.equal(allocateSyntheticParameter(state), "__tsonic_param1");
  assert.equal(allocateSyntheticParameter(state), "__tsonic_param2");
  assert.equal(state.nextParameterIndex, 3, "collisions consume the same monotone synthetic counter");
  for (const name of ["unused", "unused1", "unused2", "unused3", "__tsonic_param0", "__tsonic_param1", "__tsonic_param2", "_"]) {
    assert.equal(state.usedNames.has(name), true, name);
  }
  const empty = createDestructuringPlannerState();
  assert.equal(allocateUnusedParameter(empty), "unused");
  assert.equal(allocateUnusedParameter(empty), "unused1");
  assert.equal(empty.usedNames.has("_"), false, "the named-slot allocator never reserves native discard spelling");
});
