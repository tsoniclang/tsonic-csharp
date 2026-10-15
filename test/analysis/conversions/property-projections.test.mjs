import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpPropertyProjections } from "../../../dist/analysis/conversions/property-projections.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/index.js";

function fixture() {
  const source = { kind: "target-named", id: "Options" };
  const sourceType = {};
  const destination = {};
  const symbol = {};
  const declaration = {};
  const selected = { sourceKey: { kind: "property", name: "selected" }, sourceName: "selected", targetName: "nativeSelected",
    sourceSubjects: [symbol], sourceDeclarations: [declaration], memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64") };
  const unrelated = { ...selected, sourceKey: { kind: "property", name: "unrelated" }, sourceName: "unrelated", targetName: "nativeUnrelated",
    sourceSubjects: [{}], sourceDeclarations: [{}] };
  const shape = { targetType: source, sourceType, members: [unrelated, selected] };
  const member = { read: "property", property: { symbol, rootSymbols: [], optional: false }, declarations: [declaration] };
  const correspondence = { kind: "available", destination: { calls: [], constructs: [], indexes: [] },
    members: [{ kind: "present", source: member, destination: member }] };
  const policy = { semanticsFor: () => ({ types: { nonNullableType: type => type,
    structuralMembers(actual, required) {
      assert.equal(actual === sourceType && required === destination, true, "exact selected source and destination identity");
      return correspondence;
    } } }) };
  return { source, destination, selected, shape, correspondence, policy, shapes: { resolveTarget: () => shape } };
}

test("selected property projection preserves checked identities and omits unrelated members", () => {
  const input = fixture();
  const selected = selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes);
  assert.equal(selected?.length, 1);
  assert.equal(selected[0].source === input.source && selected[0].members[0] === input.selected, true, "exact member identity");
  assert.equal(selected[0].members.length, 1);
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected[0]) && Object.isFrozen(selected[0].members), true);
});

test("selected property projection rejects missing, unreadable, duplicated and open evidence", () => {
  for (const mutate of [
    input => { input.correspondence.kind = "unavailable"; },
    input => { input.correspondence.destination.indexes.push({}); },
    input => { input.correspondence.members[0].source = { ...input.correspondence.members[0].source, read: "unavailable" }; },
    input => { input.correspondence.members[0].source = { ...input.correspondence.members[0].source, property: { symbol: {}, rootSymbols: [] }, declarations: [{}] }; },
    input => { input.correspondence.members.push(input.correspondence.members[0]); },
    input => { input.correspondence.members[0] = { kind: "absent", destination: input.correspondence.members[0].destination }; },
    input => { input.shape.sourceType = undefined; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes) === undefined,
      true, "mutated exact correspondence rejects without native output");
  }
});

test("selected property projection accepts genuinely absent optional destination members", () => {
  const input = fixture();
  input.correspondence.members[0] = { kind: "absent", destination: {
    ...input.correspondence.members[0].destination,
    property: { ...input.correspondence.members[0].destination.property, optional: true },
  } };
  const selected = selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes);
  assert.equal(selected?.length === 1 && selected[0].members.length === 0, true, "exact optional absence");
});

test("native dictionary slots need no nominal field projection and unrelated carriers still reject", () => {
  const destination = {};
  const policy = { semanticsFor: () => ({ types: { nonNullableType: type => type } }) };
  const dictionary = { kind: "target-named", id: "NativeDictionary", csharpCollectionSurface: "record",
    typeArguments: [csharpStringTargetType(), csharpTsValueTargetType()] };
  const exact = selectCsharpPropertyProjections({}, dictionary, destination, policy, {
    resolveTarget() { assert.fail("dictionary properties already belong to the native dictionary"); },
  });
  assert.deepEqual(exact, []);
  assert.equal(Object.isFrozen(exact), true);
  for (const source of [undefined, { kind: "target-named", id: "NativeDictionary" },
    { ...dictionary, csharpCollectionSurface: "array" }, { ...dictionary, typeArguments: undefined },
    { ...dictionary, typeArguments: [csharpSourcePrimitiveTargetType("uint64"), csharpTsValueTargetType()] },
    { ...dictionary, typeArguments: [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int64")] }]) {
    const rejected = selectCsharpPropertyProjections({}, source, destination, policy, { resolveTarget: () => undefined });
    assert.equal(rejected === undefined, true, "the exact string-key/closed-value dictionary admission is mandatory");
  }
});
