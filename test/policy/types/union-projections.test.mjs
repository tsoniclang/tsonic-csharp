import assert from "node:assert/strict";
import test from "node:test";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { csharpUnionProjectionPath } from "../../../dist/policy/conversions/union-relations.js";
import { selectCsharpRuntimeUnionProjection } from "../../../dist/policy/conversions/carriers.js";
import { csharpRuntimeUnionProjectionMatches } from "../../../dist/analysis/conversions/validation.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";

test("nested union payload paths are exact, immutable and independently checked", () => {
  const integer = csharpSourcePrimitiveTargetType("uint64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const inner = csharpRuntimeUnionTargetType([integer, string]);
  const nested = csharpRuntimeUnionTargetType([boolean, inner]);
  const path = csharpUnionProjectionPath(nested, integer);
  assert.deepEqual(path, [{ union: nested, index: 1 }, { union: inner, index: 0 }]);
  assert.ok(Object.isFrozen(path) && path.every(Object.isFrozen));
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } } };
  const selected = selectCsharpRuntimeUnionProjection(policy, nested, integer);
  assert.deepEqual(selected, { kind: "runtime-union-projection", path, armType: integer, retainsAbsence: false });
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, nested, integer, selected), true);
  const accessor = { get union() { assert.fail("untrusted path getters must not run"); }, index: 0 };
  for (const changedPath of [[], path.slice(1), path.toReversed(), new Array(2), [...path, path[0]],
    [path[0], { ...path[1], union: nested }], [path[0], { ...path[1], index: 1 }], [path[0], accessor],
    [path[0], { ...path[1], extra: true }]]) {
    assert.equal(csharpRuntimeUnionProjectionMatches(policy, nested, integer, { ...selected, path: changedPath }), false);
  }
  const signed = csharpSourcePrimitiveTargetType("int64");
  assert.equal(csharpUnionProjectionPath(nested, signed), undefined);
  const optional = csharpNullableTargetType(integer);
  const optionalProjection = selectCsharpRuntimeUnionProjection(policy, nested, optional);
  assert.deepEqual(optionalProjection, { kind: "runtime-union-projection", path, armType: integer, retainsAbsence: false });
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, nested, optional, optionalProjection), true);
  assert.equal(selectCsharpRuntimeUnionProjection(policy, nested, csharpNullableTargetType(signed)).kind, "rejected",
    "absence injection cannot change native width or signedness");
  assert.equal(csharpUnionProjectionPath(csharpRuntimeUnionTargetType([integer, inner]), integer), undefined);
  const cycle = csharpSourceUnionTargetType("fixture.Cycle", "Cycle", []);
  const definitions = { sourceUnionArms: carrier => carrier === cycle ? [cycle] : undefined };
  assert.equal(csharpUnionProjectionPath(cycle, integer, definitions), undefined);
});

test("checked member evidence survives exact union projection without relaxing path or payload checks", () => {
  let reads = 0;
  const identity = Object.create({ compilerOwned: true });
  identity.self = identity;
  Object.defineProperty(identity, "poison", { get() { reads += 1; throw new Error("compiler handle must stay opaque"); } });
  const payload = { kind: "target-named", id: "test.EvidencePayload", csharpAllowsRefLikeTypeArguments: [] };
  const member = { receiverType: identity, property: { name: "value", symbol: identity, type: identity,
    rootSymbols: [identity], optional: false, readonly: true }, declarations: [identity], getters: [], setters: [], read: "property" };
  const shape = { targetType: payload, sourceType: identity, members: [{ sourceKey: { kind: "property", name: "value" },
    sourceName: "value", targetName: "value", memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64"),
    sourceMemberEvidence: [{ ownerType: identity, sourceType: identity,
      correspondence: { kind: "present", source: member, destination: member } }] }] };
  const union = csharpRuntimeUnionTargetType([payload, csharpStringTargetType()], [shape, undefined]);
  const policy = { projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) } };
  const selected = selectCsharpRuntimeUnionProjection(policy, union, payload);
  assert.equal(selected.kind, "runtime-union-projection", "the original native payload has one exact projection");
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, union, payload, selected), true,
    "valid checked member metadata cannot make a path disagree with itself");
  const [snapshot] = snapshotCsharpTargetTypes([union]);
  assert.equal(csharpRuntimeUnionProjectionMatches(policy, snapshot, payload, selected), true, "immutable roundtrip retains the same projection");
  assert.equal(snapshot.csharpRuntimeUnionObjectShapes[0].members[0].sourceMemberEvidence[0].ownerType === identity, true,
    "roundtrip retains the checked owner identity");
  const foreign = { ...payload, id: "foreign.EvidencePayload" };
  const foreignUnion = csharpRuntimeUnionTargetType([foreign, csharpStringTargetType()]);
  const poisoned = { get union() { reads += 1; return union; }, index: 0 };
  for (const changed of [
    { ...selected, path: [{ union, index: 1 }] },
    { ...selected, path: [{ union: foreignUnion, index: 0 }] },
    { ...selected, path: [poisoned] },
    { ...selected, path: [{ union, index: 0, extra: true }] },
    { ...selected, path: new Array(1) },
    { ...selected, armType: foreign },
    { ...selected, retainsAbsence: true },
  ]) assert.equal(csharpRuntimeUnionProjectionMatches(policy, union, payload, changed), false,
    "exact arm, path, payload, absence and ordinary metadata validation remain required");
  assert.equal(reads, 0, "compiler handles and untrusted path accessors are not executed");
});
