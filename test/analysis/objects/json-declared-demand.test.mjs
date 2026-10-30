import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { csharpPropertySourceMemberKey } from "../../../dist/target-model/types/source-member-keys.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

function shape(name, members = []) {
  return Object.freeze({ targetType: Object.freeze({ kind: "target-named", id: "Example." + name, csharpAllowsRefLikeTypeArguments: [] }),
    members: Object.freeze(members) });
}

function property(name, type) {
  return Object.freeze({ sourceKey: csharpPropertySourceMemberKey(name), sourceName: name, targetName: name, memberKind: "property", type });
}

function fixture(shapes) {
  const definitions = new Map(shapes.map(entry => [targetTypeRefKey(entry.targetType), entry]));
  const forbidden = () => assert.fail("declared JSON writers never inspect runtime value flow or caller bindings");
  const engine = createCsharpObjectShapeDemandEngine({ ast: {}, names: { typeParameterNames: [] },
    captureStorage: { captureFrameShape: { get() {} } }, conversions: { conversion: { get() {} } },
    sourceStorage: { get nodes() { return forbidden(); }, subjectFor: forbidden, storageProducersFor: forbidden,
      boundValueFrontierFor: forbidden, bindingsForInvocation: forbidden },
    objectShapes: { targetShapes: Object.freeze(Object.fromEntries(definitions)), knownShapes: () => [...definitions.values()],
      resolveTarget(type) { return type === undefined ? undefined : definitions.get(targetTypeRefKey(type)); } },
  });
  return { engine, artifact(closure, selected) {
    return closure.artifacts.find(entry => entry.key === objectShapeArtifactKey(selected));
  } };
}

test("typed JSON roots keep their exact native declaration and strict serializer closure", () => {
  const record = shape("Typed", [property("count", { kind: "source-primitive", name: "int64" })]);
  const selected = fixture([record]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "the declared shape is admitted");
  assert.equal(selected.engine.requireObjectShapeCapability(undefined, record.targetType, {}, "json-serialization", "object-shape").kind,
    "accepted", "a strict native root retains its existing typed serializer policy");
  const artifact = selected.artifact(selected.engine.close(), record);
  assert.equal(artifact.fact === record && artifact.capabilities.includes("json-serialization"), true, "the original native carrier owns serialization");
  assert.equal(artifact.jsonContract.properties[0].key, "count", "the original native field order/key is retained");
});

test("general native writer availability does not make non-JSON native storage a compile-time refusal", () => {
  const record = shape("OpaqueField", [property("value", { kind: "opaque", id: "native.unserializable" })]);
  const selected = fixture([record]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "ordinary native storage stays legal");
  selected.engine.registerGeneralJsonWriter(record);
  const strict = selected.engine.requireObjectShapeCapability(undefined, record.targetType, {}, "json-serialization", "object-shape");
  assert.equal(strict.kind, "rejected", "an available general writer does not forge a strict closed-leaf proof");
  assert.match(strict.reason, /no closed JSON serialization policy/u, "the original opaque-leaf boundary is retained");
  assert.equal(selected.artifact(selected.engine.close(), record).jsonContract.kind, "properties", "the general runtime path owns actual value dispatch");
});

test("native writer publication preserves the exact reference carrier without introducing a copied shape", () => {
  const record = shape("Identity", [property("count", { kind: "source-primitive", name: "int32" })]);
  const selected = fixture([record]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "the original native type is registered");
  assert.equal(selected.engine.requireObjectShapeCapability(undefined, record.targetType, {}, "reference-identity", "object-shape").kind,
    "accepted", "the actual reference contract is retained");
  selected.engine.registerGeneralJsonWriter(record);
  const closure = selected.engine.close();
  const artifact = selected.artifact(closure, record);
  assert.equal(artifact.fact === record && closure.artifacts.length === 1, true, "serialization adds no replacement carrier or backing object");
  assert.equal(artifact.capabilities.includes("reference-identity") && artifact.capabilities.includes("json-serialization"), true,
    "one original native value has both required capabilities");
});

test("foreign and unregistered native shapes cannot manufacture a general JSON writer", () => {
  const record = shape("Admitted");
  const foreign = shape("Foreign");
  const selected = fixture([record]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "the exact original type is admitted");
  assert.throws(() => selected.engine.registerGeneralJsonWriter(foreign), /exact admitted native shape/u,
    "a foreign target identity is not a serializer witness");
  const closure = selected.engine.close();
  assert.equal(selected.artifact(closure, record).jsonContract === undefined, true, "failed evidence publishes no invented native writer");
});

test("selected toJSON declarations retain their exact native result and property-key ABI", () => {
  const result = shape("Projection", [property("count", { kind: "source-primitive", name: "int64" })]);
  const text = { kind: "source-primitive", name: "string" };
  const method = Object.freeze({ sourceKey: csharpPropertySourceMemberKey("toJSON"), sourceName: "toJSON", targetName: "toJSON",
    memberKind: "method", type: csharpDelegateTargetType("System.Func", [text], result.targetType) });
  const record = shape("Callback", [method]);
  const selected = fixture([record, result]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "the declared native result dependency is registered");
  selected.engine.registerGeneralJsonWriter(record);
  const closure = selected.engine.close();
  const contract = selected.artifact(closure, record).jsonContract;
  assert.equal(contract.kind === "to-json" && contract.member === method && contract.returnType === result.targetType && contract.passesPropertyKey,
    true, "the checked declaration, exact result and selected property-key parameter stay unchanged");
  assert.equal(selected.artifact(closure, result).jsonContract?.kind, "properties", "the declared result type gets its own writer without reopening a body");
});

test("nested declared components publish native writers without following values or invocation contexts", () => {
  const child = shape("Child", [property("value", { kind: "source-primitive", name: "int64" })]);
  const record = shape("Parent", [property("children", { kind: "array", element: child.targetType })]);
  const selected = fixture([record, child]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "all declaration-owned component metadata is admitted");
  selected.engine.registerGeneralJsonWriter(record);
  const closure = selected.engine.close();
  for (const entry of [record, child]) assert.equal(selected.artifact(closure, entry).jsonContract?.kind, "properties",
    "each existing native component owns one serializer, without producer replay");
  assert.equal(closure.artifacts.length, 2, "declared dependencies create neither runtime-origin rows nor copied carriers");
});

test("general JSON writer metadata is immutable and cannot be strengthened after publication", () => {
  const record = shape("Immutable");
  const selected = fixture([record]);
  assert.equal(selected.engine.registerObjectShape(record, "synthetic").kind, "accepted", "the original type is registered");
  selected.engine.registerGeneralJsonWriter(record);
  selected.engine.registerGeneralJsonWriter(record);
  const closure = selected.engine.close();
  assert.equal(Object.isFrozen(closure) && Object.isFrozen(closure.artifacts) && closure.artifacts.length === 1, true,
    "one immutable publication deduplicates declaration requests");
  const artifact = selected.artifact(closure, record);
  assert.equal(Object.isFrozen(artifact) && Object.isFrozen(artifact.jsonContract) && Object.isFrozen(artifact.jsonContract.properties), true,
    "native writer records remain immutable");
  assert.throws(() => selected.engine.registerGeneralJsonWriter(record), /sealed/u, "late consumers cannot reselect a native writer");
});
