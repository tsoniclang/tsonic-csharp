import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpPropertyProjections } from "../../../dist/analysis/conversions/property-projections.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/index.js";

// nextgen C-2542: the projection reads published facts only. The value is a descriptor (facts.values.type), its
// members are Host object members (facts.objects.members) paired by their Host member key (facts.objects.member, R3 #14),
// the present arms are the Host closed sum's non-absence arms (facts.sums.sumOf, R3 #13), a sum arm maps to its carrier through
// CsharpTypeQueries.represent, and a shape member is found by its source declaration. The checker doubles
// (semanticsFor().types.expressionType / structuralMembers / nonNullableType / unionOrIntersectionTypes and
// types.selectSourceUnionMember) are gone; each case below keeps its old meaning on these facts.
const number = Object.freeze({ kind: "primitive", primitive: "number" });

function shapeDescriptor(extra = {}) {
  return { kind: "shape", members: [], indexes: [], calls: [], constructs: [], ...extra };
}

function objectMember(name, declarations, extra = {}) {
  return Object.freeze({ key: Object.freeze({ kind: "string", value: name }), name, kind: "property", declarations, type: number,
    optional: false, readonly: false, static: false, owner: {}, inherited: false, ...extra });
}

function refusal(site) {
  return Object.freeze({ kind: "refused", code: "TSONIC_TEST_UNPUBLISHED", message: "No fixture publication.", site });
}

function fixture() {
  const source = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Options" };
  const sourceType = shapeDescriptor();
  const destination = shapeDescriptor();
  const declaration = {};
  const unrelatedDeclaration = {};
  const selected = { sourceKey: { kind: "property", name: "selected" }, sourceName: "selected", targetName: "nativeSelected",
    sourceSubjects: [declaration], sourceDeclarations: [declaration], memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64") };
  const unrelated = { ...selected, sourceKey: { kind: "property", name: "unrelated" }, sourceName: "unrelated", targetName: "nativeUnrelated",
    sourceSubjects: [unrelatedDeclaration], sourceDeclarations: [unrelatedDeclaration] };
  const shape = { targetType: source, members: [unrelated, selected] };
  const members = new Map([
    [sourceType, [objectMember("unrelated", [unrelatedDeclaration]), objectMember("selected", [declaration])]],
    [destination, [objectMember("selected", [{}])]],
  ]);
  const input = { source, sourceType, destination, declaration, unrelatedDeclaration, selected, unrelated, shape, members,
    valueType: () => sourceType, sums: new Map(), represented: new Map() };
  input.policy = {
    facts: Object.freeze({
      values: Object.freeze({ type: node => {
        const type = input.valueType(node);
        return type === undefined ? refusal(node) : Object.freeze({ kind: "resolved", type });
      } }),
      sums: Object.freeze({ sumOf: descriptor => input.sums.get(descriptor) }),
      objects: Object.freeze({
        members: descriptor => input.members.get(descriptor) ?? refusal({}),
        member: (descriptor, key) => {
          const members = input.members.get(descriptor);
          return Array.isArray(members) ? members.find(member => member.key.kind === key.kind && member.key.value === key.value) : undefined;
        },
      }),
    }),
    types: Object.freeze({ represent: (descriptor, occurrence) => input.represented.get(descriptor) ??
      Object.freeze({ kind: "csharp-refused", code: "CSHARP_TEST_UNREPRESENTED", message: "No fixture representation.", site: occurrence }) }),
  };
  input.shapes = { resolveTarget: () => input.shape };
  return input;
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
    // the Host publishes no members for the source type (old: unavailable structural correspondence)
    input => { input.members.delete(input.sourceType); },
    // an open destination (index signature)
    input => { input.destination.indexes.push({}); },
    // an unreadable source member (a method, not a property value)
    input => { input.members.set(input.sourceType, [objectMember("selected", [input.declaration], { kind: "method" })]); },
    // the source declaration selects more than one finalized shape member
    input => { input.shape = { ...input.shape, members: [...input.shape.members, { ...input.selected, targetName: "copy" }] }; },
    // the source member of the destination key is static (no instance member; R3 #14 keyed correspondence; a Host type
    // has one member per key, so the old duplicate-name case has no counterpart)
    input => { input.members.set(input.sourceType, [objectMember("selected", [input.declaration], { static: true })]); },
    // a required destination member the source does not have
    input => { input.members.set(input.sourceType, [objectMember("unrelated", [input.unrelatedDeclaration])]); },
    // the value has no present part (old: the shape had no source type)
    input => { input.valueType = () => Object.freeze({ kind: "intrinsic", intrinsic: "absence" }); },
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes) === undefined,
      true, "mutated exact correspondence rejects without native output");
  }
});

test("selected property projection accepts genuinely absent optional destination members", () => {
  const input = fixture();
  input.members.set(input.destination, [objectMember("selected", [{}], { optional: true })]);
  input.members.set(input.sourceType, [objectMember("unrelated", [input.unrelatedDeclaration])]);
  const selected = selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes);
  assert.equal(selected?.length === 1 && selected[0].members.length === 0, true, "exact optional absence");
});

test("native dictionary slots need no nominal field projection and unrelated carriers still reject", () => {
  const input = fixture();
  // nextgen C-2542: the destination is a published shape with one required member the value's type lacks, so every
  // carrier that is not the exact string-key/TsValue dictionary rejects through the member pairing.
  input.members.set(input.destination, [objectMember("value", [{}])]);
  input.members.set(input.sourceType, []);
  const dictionary = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false], id: "NativeDictionary", csharpCollectionSurface: "record",
    typeArguments: [csharpStringTargetType(), csharpTsValueTargetType()] };
  const exact = selectCsharpPropertyProjections({}, dictionary, input.destination, input.policy, {
    resolveTarget() { assert.fail("dictionary properties already belong to the native dictionary"); },
  });
  assert.deepEqual(exact, []);
  assert.equal(Object.isFrozen(exact), true);
  for (const source of [undefined, { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "NativeDictionary" },
    { ...dictionary, csharpCollectionSurface: "array" }, { ...dictionary, typeArguments: undefined },
    { ...dictionary, typeArguments: [csharpSourcePrimitiveTargetType("uint64"), csharpTsValueTargetType()] },
    { ...dictionary, typeArguments: [csharpStringTargetType(), csharpSourcePrimitiveTargetType("int64")] }]) {
    const rejected = selectCsharpPropertyProjections({}, source, input.destination, input.policy, { resolveTarget: () => undefined });
    assert.equal(rejected === undefined, true, "the exact string-key/closed-value dictionary admission is mandatory");
  }
});

test("property projections keep each checked expression distinct when the native shape is shared", () => {
  const input = fixture();
  const first = {};
  const second = {};
  const secondType = shapeDescriptor();
  input.members.set(secondType, [objectMember("selected", input.unrelated.sourceDeclarations)]);
  input.valueType = node => node === first ? input.sourceType : node === second ? secondType : undefined;
  const firstProjection = selectCsharpPropertyProjections(first, input.source, input.destination, input.policy, input.shapes);
  const secondProjection = selectCsharpPropertyProjections(second, input.source, input.destination, input.policy, input.shapes);
  assert.equal(firstProjection?.[0].members[0] === input.selected, true, "first expression retains its selected member");
  assert.equal(secondProjection?.[0].members[0] === input.unrelated, true, "second expression never borrows the first source type");
  assert.equal(secondProjection?.[0].source === firstProjection?.[0].source, true, "physical carrier remains shared");
});

test("property projections fail on a missing Host value publication without a carrier-global fallback", () => {
  const input = fixture();
  input.valueType = () => undefined;
  // nextgen C-2542: value publication is total (I4); a missing or refused value type at a C# site is an invariant
  // failure, not an undefined result (old expectation: undefined).
  assert.throws(() => selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT",
    "retained carrier provenance cannot replace missing current source evidence");
});

function unionFixture() {
  const input = fixture();
  const firstCarrier = input.source;
  const secondCarrier = { ...firstCarrier, id: "OtherOptions" };
  const carrier = csharpRuntimeUnionTargetType([firstCarrier, secondCarrier]);
  const firstType = input.sourceType;
  const secondType = shapeDescriptor();
  const union = Object.freeze({ kind: "union", types: Object.freeze([firstType, secondType]) });
  input.members.set(secondType, [objectMember("selected", input.unrelated.sourceDeclarations)]);
  input.valueType = () => union;
  input.sums.set(union, Object.freeze({ identity: {}, arms: Object.freeze([{ role: 0, type: firstType }, { role: 1, type: secondType }]),
    roles: Object.freeze([]) }));
  input.represented.set(firstType, firstCarrier);
  input.represented.set(secondType, secondCarrier);
  const secondShape = { ...input.shape, targetType: secondCarrier, members: [input.unrelated] };
  input.shapes = { resolveTarget: selected => selected === firstCarrier ? input.shape : selected === secondCarrier ? secondShape : undefined };
  return { ...input, source: carrier, firstCarrier, secondCarrier, firstType, secondType, secondMember: input.unrelated };
}

test("optional property projection uses the published present value type", () => {
  const input = fixture();
  const optional = Object.freeze({ kind: "optional", value: input.sourceType });
  input.valueType = () => optional;
  input.sums.set(optional, Object.freeze({ identity: {}, arms: Object.freeze([{ role: 0, type: input.sourceType },
    { role: 1, type: Object.freeze({ kind: "intrinsic", intrinsic: "absence" }) }]), roles: Object.freeze([]) }));
  const projected = selectCsharpPropertyProjections({}, csharpNullableTargetType(input.source), input.destination, input.policy, input.shapes);
  assert.equal(projected?.length === 1 && projected[0].members[0] === input.selected, true, "native present member identity");
});

test("union property projections consume each exact published sum arm", () => {
  const input = unionFixture();
  const projected = selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes);
  assert.equal(projected?.length, 2);
  assert.equal(projected.find(part => part.source === input.firstCarrier)?.members[0] === input.selected, true, "first exact native arm");
  assert.equal(projected.find(part => part.source === input.secondCarrier)?.members[0] === input.secondMember, true, "second exact native arm");
});

// Q73: arms that share one carrier are one storage arm; one projection serves them when they give the same physical member.
test("coincident sum arms share one projection only when their physical members agree", () => {
  const input = unionFixture();
  input.represented.set(input.secondType, input.firstCarrier);
  input.members.set(input.secondType, [objectMember("selected", [input.declaration])]);
  const projected = selectCsharpPropertyProjections({}, input.firstCarrier, input.destination, input.policy, input.shapes);
  assert.equal(projected?.length === 1 && projected[0].source === input.firstCarrier && projected[0].members[0] === input.selected,
    true, "one storage arm, one projection");
});

// nextgen C-2542: the old "rejected" case (a rejected selectSourceUnionMember outcome) has no counterpart: the arm to
// carrier map is CsharpTypeQueries.represent, whose only failure is a refusal ("unavailable" below).
// "multiple": two arms coincide on one carrier but give different physical members, so no one projection serves both.
test("union property projection refuses unrepresented or disagreeing coincident sum arms", () => {
  for (const kind of ["unavailable", "multiple"]) {
    const input = unionFixture();
    if (kind === "multiple") input.represented.set(input.secondType, input.firstCarrier);
    else input.represented.clear();
    assert.equal(selectCsharpPropertyProjections({}, input.source, input.destination, input.policy, input.shapes) === undefined,
      true, kind);
  }
});
