import assert from "node:assert/strict";
import test from "node:test";

import {
  targetTypeRefKey,
} from "../dist/policy/types/index.js";
import {
  createCsharpTranslationArtifactGraph,
} from "../dist/translate/artifacts/index.js";

test("target-owned object shapes reconstruct from canonical artifact state", () => {
  const innerType = { kind: "target-named", id: "Example.Inner" };
  const outerType = { kind: "target-named", id: "Example.Outer" };
  const inner = {
    targetType: innerType,
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "string" },
    }],
  };
  const outer = {
    targetType: outerType,
    members: [{
      sourceName: "inner",
      targetName: "inner",
      memberKind: "property",
      type: innerType,
    }],
  };
  const shapes = new Map([
    [targetTypeRefKey(innerType), inner],
    [targetTypeRefKey(outerType), outer],
  ]);
  const artifacts = createCsharpTranslationArtifactGraph({
    ast: {},
    navigation: {},
    objectShapes: {
      resolveTarget(type) {
        return type === undefined
          ? undefined
          : shapes.get(targetTypeRefKey(type));
      },
    },
  });

  assert.deepEqual(artifacts.registerObjectShape(outer, "synthetic"), {
    kind: "accepted",
  });
  assert.deepEqual(
    artifacts.requireJsonSerialization(
      undefined,
      outerType,
      {},
      "object-shape",
    ),
    { kind: "accepted" },
  );

  const outerOwner = `object-shape:${targetTypeRefKey(outerType)}`;
  const innerOwner = `object-shape:${targetTypeRefKey(innerType)}`;
  assert.deepEqual(artifacts.reconstructArtifact(outerOwner), {
    kind: "resolved",
    contract: artifacts.contractGraph.contract(outerOwner),
    dependencies: [
      { owner: innerOwner, facet: "object-shape-type-surface" },
      { owner: innerOwner, facet: "object-shape-serialization" },
    ],
    artifact: {
      kind: "object-shape",
      fact: outer,
      materialization: "synthetic",
      jsonSerializable: true,
    },
  });
});

test("source-file artifacts cannot be acknowledged by a target-owned reconstructor", () => {
  const artifacts = createCsharpTranslationArtifactGraph({
    ast: {},
    navigation: {},
    objectShapes: { resolveTarget() {} },
  });
  const owner = "source-file:index.ts";
  assert.deepEqual(artifacts.contractGraph.commit(
    owner,
    {
      facets: [
        { facet: "source-file-implementation", value: "implementation" },
        { facet: "source-file-public-surface", value: "surface" },
      ],
    },
    [],
    { kind: "source-file", owner },
  ), {
    kind: "accepted",
    changedFacets: [
      "source-file-implementation",
      "source-file-public-surface",
    ],
    contractChanged: true,
    dependenciesChanged: true,
  });

  assert.deepEqual(artifacts.reconstructArtifact(owner), {
    kind: "rejected",
    code: "CSHARP_SOURCE_FILE_RECONSTRUCTOR_OWNERSHIP_INVALID",
    reason:
      "Dirty C# source-file artifact 'source-file:index.ts' must be reconstructed by its source-file planner.",
  });
});
