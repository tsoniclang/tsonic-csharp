import assert from "node:assert/strict";
import test from "node:test";
import { captureDependencies, dependOn } from "../../../../dist/backend/planner/artifacts/graph/dependencies.js";
import { createCsharpArtifactGraph } from "../../../../dist/backend/planner/artifacts/graph.js";
import { collectShapeDependencies } from "../../../../dist/backend/planner/artifacts/graph/object-shapes/batches.js";
import { objectShapeArtifactKey } from "../../../../dist/backend/planner/artifacts/graph/object-shapes/identity.js";
import { targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

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

test("artifact closure includes exact generic declaration-template parents alongside concrete components", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const parameter = { kind: "type-parameter", identity: "Root:Property", name: "Property" };
  const target = (id, argument) => ({ kind: "target-named", id, typeArguments: [argument] });
  const parent = { targetType: target("Parent", parameter), members: [] };
  const concreteParent = { targetType: target("Parent", integer), members: [] };
  const template = { targetType: target("Root", parameter), members: [], implements: [parent.targetType] };
  const root = { targetType: target("Root", integer), members: [], implements: [concreteParent.targetType],
    declarationTemplate: template };
  const shapes = new Map([parent, concreteParent, root].map(shape => [targetTypeRefKey(shape.targetType), shape]));
  const scope = { host: { objectShapes: { resolveTarget: type => shapes.get(targetTypeRefKey(type)) } } };
  const selected = collectShapeDependencies(scope, root);
  assert.equal(selected.kind, "accepted");
  assert.equal(selected.shapes.get(objectShapeArtifactKey(parent)) === parent, true, "the emitted generic parent exists");
  assert.equal(selected.shapes.get(objectShapeArtifactKey(concreteParent)) === concreteParent, true, "concrete identity remains distinct");
  assert.deepEqual([...selected.dependencies.get(objectShapeArtifactKey(root))].sort(),
    [objectShapeArtifactKey(parent), objectShapeArtifactKey(concreteParent)].sort());
  parent.implements = [root.targetType];
  const cyclic = collectShapeDependencies(scope, root);
  assert.equal(cyclic.kind, "accepted", "existing finite graph handles template cycles");
  assert.equal(cyclic.shapes.size, 3, "cycle introduces no duplicate artifact");
});

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
