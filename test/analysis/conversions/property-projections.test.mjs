import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpPropertyProjections } from "../../../dist/analysis/conversions/property-projections.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/index.js";

function fixture() {
  const source = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Options" };
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
  const policy = { semanticsFor: () => ({ types: { nonNullableType: type => type, expressionType: () => sourceType, isUnion: () => false,
    structuralMembers(actual, required, purpose) {
      assert.equal(purpose, "read", "property projection requires readable source values");
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
  const dictionary = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false], id: "NativeDictionary", csharpCollectionSurface: "record",
    typeArguments: [csharpStringTargetType(), csharpTsValueTargetType()] };
  const exact = selectCsharpPropertyProjections({}, dictionary, destination, policy, {
    resolveTarget() { assert.fail("dictionary properties already belong to the native dictionary"); },
  });
  assert.deepEqual(exact, []);
  assert.equal(Object.isFrozen(exact), true);
  for (const source of [undefined, { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "NativeDictionary" },
    { ...dictionary, csharpCollectionSurface: "array" }, { ...dictionary, typeArguments: undefined },
    { ...dictionary, typeArguments: [csharpSourcePrimitiveTargetType("uint64"), csharpTsValueTargetType()] },
    { ...dictionary, typeArguments: [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int64")] }]) {
    const rejected = selectCsharpPropertyProjections({}, source, destination, policy, { resolveTarget: () => undefined });
    assert.equal(rejected === undefined, true, "the exact string-key/closed-value dictionary admission is mandatory");
  }
});

test("property projections keep each checked expression distinct when the native shape is shared", () => {
  const input = fixture();
  const first = {};
  const second = {};
  const firstType = input.shape.sourceType;
  const secondType = {};
  const secondMember = input.shape.members[0];
  const secondProperty = {
    read: "property",
    property: { symbol: secondMember.sourceSubjects[0], rootSymbols: [], optional: false },
    declarations: secondMember.sourceDeclarations,
  };
  const secondCorrespondence = {
    kind: "available",
    destination: { calls: [], constructs: [], indexes: [] },
    members: [{ kind: "present", source: secondProperty, destination: secondProperty }],
  };
  const types = input.policy.semanticsFor().types;
  input.policy.semanticsFor = () => ({ types: {
    ...types,
    expressionType: node => node === first ? firstType : node === second ? secondType : undefined,
    structuralMembers(actual, required, purpose) {
      assert.equal(required === input.destination && purpose === "read", true, "same checked destination relation");
      assert.equal(actual === firstType || actual === secondType, true, "current checked expression identity");
      return actual === firstType ? input.correspondence : secondCorrespondence;
    },
  } });
  const firstProjection = selectCsharpPropertyProjections(first, input.source, input.destination, input.policy, input.shapes);
  const secondProjection = selectCsharpPropertyProjections(second, input.source, input.destination, input.policy, input.shapes);
  assert.equal(firstProjection?.[0].members[0] === input.selected, true, "first expression retains its selected member");
  assert.equal(secondProjection?.[0].members[0] === secondMember, true, "second expression never borrows the first source type");
  assert.equal(secondProjection?.[0].source === firstProjection?.[0].source, true, "physical carrier remains shared");
});

test("property projections reject missing checked expression evidence without a carrier-global fallback", () => {
  const input = fixture();
  const semantics = input.policy.semanticsFor();
  semantics.types.expressionType = () => undefined;
  input.policy.semanticsFor = () => semantics;
  assert.equal(selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes) === undefined,
    true, "retained carrier provenance cannot replace missing current source evidence");
});

function unionFixture() {
  const input = fixture();
  const firstCarrier = input.source;
  const secondCarrier = { ...firstCarrier, id: "OtherOptions" };
  const carrier = csharpRuntimeUnionTargetType([firstCarrier, secondCarrier]);
  const firstType = input.shape.sourceType;
  const secondType = {};
  const checked = {};
  const sourceFile = {};
  const secondMember = input.shape.members[0];
  const secondProperty = { read: "property",
    property: { symbol: secondMember.sourceSubjects[0], rootSymbols: [], optional: false },
    declarations: secondMember.sourceDeclarations };
  const secondCorrespondence = { kind: "available", destination: { calls: [], constructs: [], indexes: [] },
    members: [{ kind: "present", source: secondProperty, destination: secondProperty }] };
  const types = input.policy.semanticsFor().types;
  types.expressionType = () => checked;
  types.isUnion = type => type === checked;
  types.unionOrIntersectionTypes = () => [firstType, secondType];
  types.structuralMembers = (actual, required, purpose) => {
    assert.equal(required === input.destination && purpose === "read", true, "same selected destination");
    assert.equal(actual === firstType || actual === secondType, true, "a checked arm, never the whole union");
    return actual === firstType ? input.correspondence : secondCorrespondence;
  };
  input.policy.semanticsFor = () => ({ types, sourceFile });
  input.policy.types = { selectSourceUnionMember(source, selected, file) {
    assert.equal(source === carrier && file === sourceFile, true, "existing retained source-union index");
    return { kind: "resolved", carrier: selected === firstType ? firstCarrier : secondCarrier };
  } };
  input.shapes = { resolveTarget: selected => selected === firstCarrier ? input.shape
    : selected === secondCarrier ? { ...input.shape, targetType: secondCarrier, sourceType: secondType, members: [secondMember] } : undefined };
  return { ...input, source: carrier, firstCarrier, secondCarrier, firstType, secondType, secondMember, types };
}

test("optional property projection uses the existing non-nullable checked source", () => {
  const input = fixture();
  const optional = {};
  const semantics = input.policy.semanticsFor();
  semantics.types.expressionType = () => optional;
  semantics.types.nonNullableType = type => type === optional ? input.shape.sourceType : type;
  input.policy.semanticsFor = () => semantics;
  const projected = selectCsharpPropertyProjections({}, csharpNullableTargetType(input.source), input.destination, input.policy, input.shapes);
  assert.equal(projected?.length === 1 && projected[0].members[0] === input.selected, true, "native present member identity");
});

test("union property projections consume each exact retained checked source arm", () => {
  const input = unionFixture();
  const projected = selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes);
  assert.equal(projected?.length, 2);
  assert.equal(projected.find(part => part.source === input.firstCarrier)?.members[0] === input.selected, true, "first exact native arm");
  assert.equal(projected.find(part => part.source === input.secondCarrier)?.members[0] === input.secondMember, true, "second exact native arm");
});

test("union property projection refuses missing conflicting or multiply-mapped checked source evidence", () => {
  for (const kind of ["unavailable", "rejected", "multiple"]) {
    const input = unionFixture();
    if (kind === "multiple") {
      const alias = {};
      input.types.unionOrIntersectionTypes = () => [input.firstType, input.secondType, alias];
      const select = input.policy.types.selectSourceUnionMember;
      input.policy.types.selectSourceUnionMember = (source, selected, file) => select(source, selected === alias ? input.firstType : selected, file);
    } else {
      input.policy.types.selectSourceUnionMember = () => ({ kind });
    }
    assert.equal(selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes) === undefined,
      true, kind);
  }
});
