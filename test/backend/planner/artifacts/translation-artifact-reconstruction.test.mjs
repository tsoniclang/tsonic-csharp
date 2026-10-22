import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeDemandEngine } from "../../../../dist/analysis/objects/native-demand-requests.js";
import { publishCsharpNativeArtifactDemand } from "../../../../dist/analysis/program/records/native-demand.js";
import { selectCsharpObjectShapePublication } from "../../../../dist/analysis/names/object-shapes.js";
import { csharpJsArrayTargetType } from "../../../../dist/target-model/types/carriers/js.js";
import { csharpStringTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

import {
  csharpDelegateTargetType,
  csharpObjectShapeMemberContractKey,
  csharpPropertySourceMemberKey,
  targetTypeRefKey,
} from "../../../../dist/policy/types/index.js";
function publishDemand(demand) {
  return publishCsharpNativeArtifactDemand(selectCsharpObjectShapePublication(demand.close(), { typeParameterNames: [] }));
}

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
    names: { typeParameterNames: [] }, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get() {} } },
    navigation: {},
    objectShapes: {
      targetShapes: Object.freeze(Object.fromEntries(shapes)),
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

  const artifacts = publishDemand(demand);
  const outerOwner = `object-shape:${targetTypeRefKey(outerType)}`;
  const innerOwner = `object-shape:${targetTypeRefKey(innerType)}`;
  const selected = artifacts.get(outerOwner);
  assert.equal(selected.fact === outer, true, "the original native shape owns its publication");
  assert.equal(selected.materialization, "synthetic");
  assert.deepEqual(selected.capabilities, ["json-serialization"]);
  assert.deepEqual(selected.projections, []);
  assert.deepEqual(selected.typeParameterNames, []);
  assert.deepEqual(selected.receiverBoundMethodKeys, []);
  assert.deepEqual(selected.dependencies, [innerOwner]);
  assert.equal(artifacts.get(innerOwner).fact === inner, true, "the exact transitive native owner is published");
});

test("object-shape receiver requirements are complete and immutable before publication", () => {
  const method = { sourceKey: csharpPropertySourceMemberKey("read"), sourceName: "read", targetName: "read", memberKind: "method",
    type: csharpDelegateTargetType("System.Func", [], { kind: "source-primitive", name: "int32" }) };
  const shape = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Example.Counter" }, members: [method] };
  const host = { ast: {}, names: { typeParameterNames: [] }, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get() {} } }, navigation: {},
    objectShapes: { targetShapes: Object.freeze({ [targetTypeRefKey(shape.targetType)]: shape }), resolveTarget() { return shape; } } };
  const before = createCsharpObjectShapeDemandEngine(host);
  assert.equal(before.registerObjectShape(shape, "synthetic").kind, "accepted");
  const owner = 'object-shape:' + targetTypeRefKey(shape.targetType);
  assert.equal(publishDemand(before).get(owner).receiverBoundMethodKeys.length, 0, "receiver storage is not demanded initially");
  const demand = createCsharpObjectShapeDemandEngine(host);
  assert.equal(demand.registerObjectShape(shape, "synthetic").kind, "accepted");
  assert.equal(demand.requireObjectShapeMethodReceiver(shape, method).kind, "accepted");
  assert.equal(demand.requireObjectShapeMethodReceiver(shape, method).kind, "accepted", "the same source requirement is idempotent");
  assert.match(demand.requireObjectShapeMethodReceiver(shape, { ...method, sourceKey: csharpPropertySourceMemberKey("other"), sourceName: "other" }).reason,
    /exact method member/u);
  const artifacts = publishDemand(demand);
  const selected = artifacts.get(owner);
  assert.deepEqual(selected.receiverBoundMethodKeys, [csharpObjectShapeMemberContractKey(method)]);
  assert.equal(Object.isFrozen(selected.receiverBoundMethodKeys), true, "the native ABI is immutable");
  assert.equal(artifacts.get(owner) === selected, true, "repeated sealed reads cannot strengthen publication");
  assert.equal(Object.hasOwn(artifacts, "requireObjectShapeMethodReceiver"), false, "late demand API is absent");
  assert.throws(() => demand.requireObjectShapeMethodReceiver(shape, method), /sealed/u);
});

function genericReceiverArtifacts() {
  const parameter = { kind: "type-parameter", identity: "GenericReceiver:Value", name: "Value" };
  const integer = { kind: "source-primitive", name: "int32" };
  const member = type => ({ sourceKey: csharpPropertySourceMemberKey("read"), sourceName: "read", targetName: "read",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [], type) });
  const target = type => ({ kind: "target-named", id: "tsonic.shape:GenericReceiver", typeArguments: [type],
    csharpAllowsRefLikeTypeArguments: [false], csharpRender: { kind: "named", name: "GenericReceiver" } });
  const declaration = { targetType: target(parameter), members: [member(parameter)] };
  const instance = { targetType: target(integer), members: [member(integer)], declarationTemplate: declaration };
  const shapes = new Map([declaration, instance].map(shape => [targetTypeRefKey(shape.targetType), shape]));
  const demand = createCsharpObjectShapeDemandEngine({ ast: {}, names: { typeParameterNames: [] },
    captureStorage: { captureFrameShape: { get() {} } }, conversions: { conversion: { get() {} } }, objectShapes: {
    targetShapes: Object.freeze(Object.fromEntries(shapes)),
    resolveTarget: type => shapes.get(targetTypeRefKey(type)), knownShapes: () => [declaration, instance],
  } });
  return { demand, declaration, instance };
}

test("closed generic receivers share the exact declaration ABI without late strengthening", () => {
  for (const receiverFirst of [false, true]) {
    const { demand, declaration, instance } = genericReceiverArtifacts();
    if (receiverFirst) assert.equal(demand.requireObjectShapeMethodReceiver(declaration, declaration.members[0]).kind, "accepted",
      "the native declaration receiver is admitted first");
    assert.equal(demand.registerObjectShape(instance, "synthetic").kind, "accepted", "the closed use is admitted");
    if (!receiverFirst) assert.equal(demand.requireObjectShapeMethodReceiver(declaration, declaration.members[0]).kind, "accepted",
      "a later authored declaration requirement reaches the already admitted closed use");
    const publication = publishDemand(demand);
    const declarationKey = `object-shape:${targetTypeRefKey(declaration.targetType)}`;
    const instanceKey = `object-shape:${targetTypeRefKey(instance.targetType)}`;
    assert.equal(publication.get(instanceKey).dependencies.includes(declarationKey), true,
      "a closed native use retains its one generic declaration owner");
    assert.equal(publication.get(instanceKey).receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(instance.members[0])), true,
      "the closed member uses its own substituted exact receiver key");
    assert.equal(publication.get(declarationKey).receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(declaration.members[0])), true,
      "the emitted declaration uses its authored generic receiver key");
    const original = publication.get(instanceKey);
    assert.equal(original.receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(instance.members[0])), true,
      "closed consumers read the sealed native ABI");
    assert.equal(publication.get(declarationKey).receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(declaration.members[0])), true,
      "declaration consumers read the same native ABI");
    assert.equal(publication.get(instanceKey) === original, true, "neither read strengthens native publication");
  }
});

test("copied CLR methods cannot conflict with a generic declaration receiver in either request order", () => {
  for (const copyFirst of [false, true]) {
    const { demand, declaration, instance } = genericReceiverArtifacts();
    assert.equal(demand.registerObjectShape(instance, "synthetic").kind, "accepted", "the closed native owner is admitted");
    const copy = () => demand.requireObjectShapeCapability(undefined, instance.targetType, {}, "method-values", "object-shape");
    const receiver = () => demand.requireObjectShapeMethodReceiver(declaration, declaration.members[0]);
    assert.equal((copyFirst ? copy() : receiver()).kind, "accepted", "the first exact requirement is admitted");
    const conflict = copyFirst ? receiver() : copy();
    assert.equal(conflict.kind, "rejected", "an incompatible CLR receiver is refused before publication");
    assert.match(conflict.reason, /receiver/u, "the actual native receiver mismatch is never hidden");
  }
});

function genericCapabilityArtifacts() {
  const parameter = { kind: "type-parameter", identity: "PhysicalCapability:Value", name: "Value" };
  const integer = { kind: "source-primitive", name: "int32" };
  const text = { kind: "source-primitive", name: "string" };
  const target = argument => ({ kind: "target-named", id: "tsonic.shape:PhysicalCapability", typeArguments: [argument],
    csharpAllowsRefLikeTypeArguments: [false], csharpRender: { kind: "named", name: "PhysicalCapability" } });
  const declaration = { targetType: target(parameter), members: [] };
  const first = { targetType: target(integer), members: [], declarationTemplate: declaration };
  const second = { targetType: target(text), members: [], declarationTemplate: declaration };
  const unrelated = { targetType: { ...target(integer), id: "tsonic.shape:UnrelatedCapability" }, members: [] };
  const facts = [declaration, first, second, unrelated];
  const byTarget = new Map(facts.map(fact => [targetTypeRefKey(fact.targetType), fact]));
  const demand = createCsharpObjectShapeDemandEngine({ ast: {}, names: { typeParameterNames: [] },
    captureStorage: { captureFrameShape: { get() {} } }, conversions: { conversion: { get() {} } }, objectShapes: {
    targetShapes: Object.freeze(Object.fromEntries(byTarget)),
    resolveTarget: type => type === undefined ? undefined : byTarget.get(targetTypeRefKey(type)),
    resolveNode: () => undefined,
    knownShapes: () => facts,
    propertyOrder: () => ({ kind: "resolved", propertyOrder: [] }),
  } });
  return { demand, declaration, first, second, unrelated };
}

test("one exact native declaration publishes the selected capabilities for every closed view", () => {
  for (const capability of ["reference-identity", "method-values", "enumerable-keys", "js-freeze", "json-serialization"]) {
    for (const capabilityFirst of [false, true]) {
      const { demand, declaration, first, second, unrelated } = genericCapabilityArtifacts();
      assert.equal(demand.registerObjectShape(first, "synthetic").kind, "accepted", "the first closed carrier is admitted");
      const request = () => demand.requireObjectShapeCapability(undefined, first.targetType, {}, capability, "object-shape");
      if (capabilityFirst) assert.equal(request().kind, "accepted", "the actual selected capability precedes the other use");
      assert.equal(demand.registerObjectShape(second, "synthetic").kind, "accepted", "a second native instantiation shares the declaration");
      assert.equal(demand.registerObjectShape(unrelated, "synthetic").kind, "accepted", "an unrelated plain declaration stays independent");
      if (!capabilityFirst) assert.equal(request().kind, "accepted", "the later capability reaches the existing physical declaration");
      const published = publishDemand(demand);
      for (const fact of [declaration, first, second]) {
        const artifact = published.get(`object-shape:${targetTypeRefKey(fact.targetType)}`);
        assert.equal(artifact !== undefined && artifact.fact === fact, true, "every concrete identity and its declaration survive publication");
        assert.equal(artifact.capabilities.length === 1 && artifact.capabilities[0] === capability, true,
          "each view reads the one exact selected physical capability surface");
        assert.equal(Object.isFrozen(artifact.capabilities), true, "physical capability publication cannot be strengthened");
      }
      assert.equal(published.get(`object-shape:${targetTypeRefKey(unrelated.targetType)}`).capabilities.length, 0,
        "physical grouping never marks an unrelated plain unboxed shape");
    }
  }
});

test("one exact native declaration retains every selected projection and each source-site identity", () => {
  const { demand, declaration, first, second } = genericCapabilityArtifacts();
  const firstSite = {};
  const secondSite = {};
  // Object.keys produces the exact JS string array, validated when the projection is requested.
  const keys = demand.requireObjectShapeProjection(firstSite, first.targetType, {}, "keys",
    csharpJsArrayTargetType(csharpStringTargetType()), "object-shape");
  const hasOwn = demand.requireObjectShapeProjection(secondSite, second.targetType, {}, "has-own",
    { kind: "source-primitive", name: "bool" }, "object-shape");
  assert.equal(keys.kind === "accepted" && keys.projection !== undefined, true, "the actual first source projection is admitted");
  assert.equal(hasOwn.kind === "accepted" && hasOwn.projection !== undefined, true, "the actual second source projection is admitted");
  const published = publishDemand(demand);
  for (const fact of [declaration, first, second]) {
    const artifact = published.get(`object-shape:${targetTypeRefKey(fact.targetType)}`);
    assert.equal(artifact.projections.length === 2 && artifact.projections.some(projection => projection.selection === keys.projection) &&
      artifact.projections.some(projection => projection.selection === hasOwn.projection),
      true, "the physical declaration has both exact immutable selected projection bodies");
    assert.equal(artifact.capabilities.length, 0, "projection publication does not invent an unrelated capability");
  }
  assert.equal(published.projection(firstSite).selection === keys.projection, true, "the first checked source site retains its own exact selection");
  assert.equal(published.projection(secondSite).selection === hasOwn.projection, true, "the second checked source site retains its own exact selection");
});

test("source-file artifacts have no object-shape publication or reconstruction route", () => {
  const demand = createCsharpObjectShapeDemandEngine({ ast: {}, names: { typeParameterNames: [] },
    captureStorage: { captureFrameShape: { get() {} } }, conversions: { conversion: { get() {} } },
    navigation: {}, objectShapes: { targetShapes: Object.freeze({}), resolveTarget() {} } });
  const publication = publishDemand(demand);
  assert.equal(publication.get("source-file:index.ts"), undefined);
  assert.equal(publication.artifacts.length, 0);
  assert.equal(Object.hasOwn(publication, "reconstructArtifact"), false, "the old cross-owner reconstructor is absent");
});
