import assert from "node:assert/strict";
import test from "node:test";
import { captureDependencies, dependOn } from "../../../../dist/backend/planner/artifacts/graph/dependencies.js";
import { createCsharpArtifactGraph } from "../../../../dist/backend/planner/artifacts/graph.js";

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

test("first-demand helper publication precedes its exact captured read", () => {
  const artifacts = artifactFixture();
  const captured = artifacts.captureDependencies("source", [], () =>
    artifacts.requireGeneratedHelper("lifted-provider-argument-adapter"));
  assert.equal(captured.value.kind, "accepted");
  assert.equal(captured.stable, true);
  assert.deepEqual(captured.dependencies, [{
    owner: "generated-helper:lifted-provider-argument-adapter",
    facet: "generated-helper-surface",
  }]);
  assert.equal(artifacts.contractGraph.hasPublishedFacet(captured.dependencies[0]), true);
});

test("publication after an explicit absent-facet snapshot requires reconstruction", () => {
  const artifacts = artifactFixture();
  const dependency = {
    owner: "generated-helper:lifted-provider-argument-adapter",
    facet: "generated-helper-surface",
  };
  assert.equal(artifacts.contractGraph.hasPublishedFacet(dependency), false);
  const captured = artifacts.captureDependencies("source", [dependency], () =>
    artifacts.requireGeneratedHelper("lifted-provider-argument-adapter"));
  assert.equal(captured.value.kind, "accepted");
  assert.equal(captured.stable, false);
  assert.deepEqual(captured.dependencies, [dependency]);
  const finalized = artifacts.captureDependencies("source", [dependency], () =>
    artifacts.requireGeneratedHelper("lifted-provider-argument-adapter"));
  assert.equal(finalized.value.kind, "accepted");
  assert.equal(finalized.stable, true);
  assert.deepEqual(finalized.dependencies, [dependency]);
});

test("unavailable object-shape capabilities fail at their exact owner without publication", () => {
  const artifacts = artifactFixture();
  const captured = artifacts.captureDependencies("source", [], () =>
    artifacts.requireObjectShapeCapability(undefined, { kind: "target-named", id: "MissingShape" }, {},
      "json-serialization", "object-shape"));
  assert.equal(captured.value.kind, "rejected");
  assert.equal(captured.value.reason,
    "Selected 'json-serialization' operation requires an exact closed object-shape argument.");
  assert.equal(captured.stable, true);
  assert.equal(captured.dependencies.length, 0);
  assert.equal(artifacts.contractGraph.artifactCount, 0);
});

function artifactFixture() {
  return createCsharpArtifactGraph({ ast: {}, objectShapes: { resolveTarget() {}, resolveNode() {} } });
}

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
