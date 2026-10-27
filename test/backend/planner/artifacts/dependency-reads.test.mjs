import assert from "node:assert/strict";
import test from "node:test";
import { collectShapeDependencies } from "../../../../dist/analysis/objects/native-demand-batches.js";
import { objectShapeArtifactKey } from "../../../../dist/target-model/records/objects/object-shape-keys.js";
import { targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";
import { createCsharpObjectShapeDemandEngine } from "../../../../dist/analysis/objects/native-demand-requests.js";

test("artifact closure includes exact generic declaration-template parents alongside concrete components", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const parameter = { kind: "type-parameter", identity: "Root:Property", name: "Property" };
  const target = (id, argument) => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id, typeArguments: [argument] });
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
  assert.equal(selected.shapes.get(objectShapeArtifactKey(template)) === template, true, "the exact generic declaration owner exists");
  assert.deepEqual([...selected.dependencies.get(objectShapeArtifactKey(root))].sort(),
    [objectShapeArtifactKey(parent), objectShapeArtifactKey(concreteParent), objectShapeArtifactKey(template)].sort());
  parent.implements = [root.targetType];
  const cyclic = collectShapeDependencies(scope, root);
  assert.equal(cyclic.kind, "accepted", "existing finite graph handles template cycles");
  assert.equal(cyclic.shapes.size, 4, "the declaration owner and both parents occur once through the cycle");
});

test("unavailable object-shape capabilities fail at their exact owner without publication", () => {
  const demand = createCsharpObjectShapeDemandEngine({ objectShapes: { targetShapes: Object.freeze({}), resolveTarget() {}, resolveNode() {} },
    ast: {}, names: { typeParameterNames: [] }, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get() {} } } });
  const requested = demand.requireObjectShapeCapability(undefined,
    { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "MissingShape" }, {}, "json-serialization", "object-shape");
  assert.equal(requested.kind, "rejected");
  assert.equal(requested.reason,
    "Selected 'json-serialization' operation requires an exact closed object-shape argument.");
  const publication = demand.close();
  assert.equal(publication.artifacts.length, 0);
  assert.equal(Object.hasOwn(publication, "requireObjectShapeCapability"), false, "the backend cannot request late capability publication");
});
