import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeDemandEngine } from "../../../../dist/analysis/objects/native-demand-requests.js";
import { csharpObjectShapeContractCandidate } from "../../../../dist/backend/planner/artifacts/contracts.js";

import {
  csharpDelegateTargetType,
  csharpObjectShapeMemberContractKey,
  csharpPropertySourceMemberKey,
  targetTypeRefKey,
} from "../../../../dist/policy/types/index.js";
import {
  createCsharpArtifactGraph,
} from "../../../../dist/backend/planner/artifacts/index.js";

test("target-owned object shapes reconstruct from canonical artifact state", () => {
  const innerType = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Example.Inner" };
  const outerType = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Example.Outer" };
  const inner = {
    targetType: innerType,
    members: [{
      sourceKey: csharpPropertySourceMemberKey("value"),
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: { kind: "source-primitive", name: "string" },
    }],
  };
  const outer = {
    targetType: outerType,
    members: [{
      sourceKey: csharpPropertySourceMemberKey("inner"),
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
  const demand = createCsharpObjectShapeDemandEngine({
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

  assert.deepEqual(demand.registerObjectShape(outer, "synthetic"), {
    kind: "accepted",
  });
  assert.deepEqual(
    demand.requireObjectShapeCapability(
      undefined,
      outerType,
      {},
      "json-serialization",
      "object-shape",
    ),
    { kind: "accepted" },
  );

  const artifacts = createCsharpArtifactGraph({ objectShapeArtifacts: demand.seal() });
  const outerOwner = `object-shape:${targetTypeRefKey(outerType)}`;
  const innerOwner = `object-shape:${targetTypeRefKey(innerType)}`;
  assert.deepEqual(artifacts.reconstructArtifact(outerOwner), {
    kind: "resolved",
    contract: artifacts.contractGraph.contract(outerOwner),
    dependencies: [
      { owner: innerOwner, facet: "object-shape-type-surface" },
      { owner: innerOwner, facet: "object-shape-behavior" },
    ],
    artifact: {
      kind: "object-shape",
      fact: outer,
      materialization: "synthetic",
      capabilities: ["json-serialization"],
      projections: [],
      receiverBoundMethodKeys: [],
    },
  });
});

test("object-shape receiver requirements strengthen one exact generated type surface monotonically", () => {
  const method = {
    sourceKey: csharpPropertySourceMemberKey("read"),
    sourceName: "read",
    targetName: "read",
    memberKind: "method",
    type: csharpDelegateTargetType(
      "System.Func",
      [],
      { kind: "source-primitive", name: "int32" },
    ),
  };
  const shape = {
    targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Example.Counter" },
    members: [method],
  };
  const demand = createCsharpObjectShapeDemandEngine({
    ast: {},
    navigation: {},
    objectShapes: { resolveTarget() { return shape; } },
  });

  assert.deepEqual(demand.registerObjectShape(shape, "synthetic"), {
    kind: "accepted",
  });
  const owner = `object-shape:${targetTypeRefKey(shape.targetType)}`;
  const before = demand.objectShapeArtifacts()[0];
  assert.equal(before.receiverBoundMethodKeys.length, 0, "receiver storage is not demanded initially");
  const initialContract = csharpObjectShapeContractCandidate(owner, shape, "synthetic", before.capabilities,
    before.projections, before.receiverBoundMethodKeys, before.dependencies);
  assert.deepEqual(demand.requireObjectShapeMethodReceiver(shape, method), { kind: "accepted" });
  const after = demand.objectShapeArtifacts()[0];
  const strengthened = csharpObjectShapeContractCandidate(owner, shape, "synthetic", after.capabilities,
    after.projections, after.receiverBoundMethodKeys, after.dependencies);
  assert.equal(initialContract.contract.facets.find(facet => facet.facet === "object-shape-type-surface").value !==
    strengthened.contract.facets.find(facet => facet.facet === "object-shape-type-surface").value, true,
    "the canonical type surface strengthens before publication");
  assert.deepEqual(demand.requireObjectShapeMethodReceiver(shape, method), { kind: "accepted" });
  assert.deepEqual(demand.objectShapeArtifacts()[0].receiverBoundMethodKeys, [csharpObjectShapeMemberContractKey(method)]);
  assert.match(demand.requireObjectShapeMethodReceiver(shape, { ...method, sourceKey: csharpPropertySourceMemberKey("other"),
    sourceName: "other" }).reason, /exact method member/u);
  const artifacts = createCsharpArtifactGraph({ objectShapeArtifacts: demand.seal() });
  assert.equal(artifacts.objectShapeMethodUsesReceiver(shape, method), true);
  const revision = artifacts.revision;
  assert.equal(artifacts.objectShapeMethodUsesReceiver(shape, method), true);
  assert.equal(artifacts.revision, revision, "sealed reads cannot strengthen a backend contract");
  assert.equal(Object.hasOwn(artifacts, "requireObjectShapeMethodReceiver"), false, "late demand API is removed");

});

test("source-file artifacts cannot be acknowledged by a target-owned reconstructor", () => {
  const demand = createCsharpObjectShapeDemandEngine({
    ast: {},
    navigation: {},
    objectShapes: { resolveTarget() {} },
  });
  const artifacts = createCsharpArtifactGraph({ objectShapeArtifacts: demand.seal() });
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
