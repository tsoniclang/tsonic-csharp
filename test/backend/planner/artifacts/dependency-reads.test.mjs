import assert from "node:assert/strict";
import test from "node:test";
import { captureDependencies, dependOn } from "../../../../dist/backend/planner/artifacts/graph/dependencies.js";

function fixture() {
  const revisions = new Map();
  const scope = { dependencyCapture: { active: undefined }, contracts: {
    facetRevision: (owner, facet) => revisions.get(JSON.stringify([owner, facet])) ?? 0,
  } };
  return { scope, change(owner, facet) {
    const key = JSON.stringify([owner, facet]);
    revisions.set(key, (revisions.get(key) ?? 0) + 1);
  } };
}

test("unrelated contract updates do not invalidate exact source reads", () => {
  const selected = fixture();
  const expected = {};
  const captured = captureDependencies(selected.scope, "source", [], () => {
    dependOn(selected.scope, "shape", "object-shape-type-surface");
    selected.change("other", "object-shape-behavior");
    selected.change("shape", "object-shape-materialization");
    return expected;
  });
  assert.equal(captured.stable, true);
  assert.equal(captured.value === expected, true);
  assert.equal(captured.dependencies.length, 1);
  assert.equal(captured.dependencies[0].owner, "shape");
  assert.equal(captured.dependencies[0].facet, "object-shape-type-surface");
  assert.equal(selected.scope.dependencyCapture.active, undefined);
});

test("the first exact read detects changes even when the facet is read again", () => {
  const selected = fixture();
  const captured = captureDependencies(selected.scope, "source", [], () => {
    dependOn(selected.scope, "shape", "object-shape-behavior");
    selected.change("shape", "object-shape-behavior");
    dependOn(selected.scope, "shape", "object-shape-behavior");
  });
  assert.equal(captured.stable, false);
  assert.equal(captured.dependencies.length, 1);
});

test("explicit prerequisites participate in the same read capture", () => {
  const selected = fixture();
  const captured = captureDependencies(selected.scope, "source", [
    { owner: "module", facet: "source-file-public-surface" },
  ], () => selected.change("module", "source-file-public-surface"));
  assert.equal(captured.stable, false);
  assert.equal(captured.dependencies.length, 1);
  assert.equal(captured.dependencies[0].owner, "module");
});

test("nested or throwing builds cannot retain a dependency capture", () => {
  const selected = fixture();
  const failure = new Error("construction failure");
  assert.throws(() => captureDependencies(selected.scope, "source", [], () => {
    dependOn(selected.scope, "shape", "object-shape-behavior");
    throw failure;
  }), error => error === failure);
  assert.equal(selected.scope.dependencyCapture.active, undefined);
  assert.throws(() => captureDependencies(selected.scope, "outer", [], () =>
    captureDependencies(selected.scope, "inner", [], () => undefined)), /nested dependency capture/u);
  assert.equal(selected.scope.dependencyCapture.active, undefined);
  assert.equal(captureDependencies(selected.scope, "clean", [], () => 3).stable, true);
});
