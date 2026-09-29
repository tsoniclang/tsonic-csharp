import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceCallResult } from "../../../dist/policy/types/resolution/call-results.js";

const base = { kind: "target-named", id: "fixture.Base" };
const child = { kind: "target-named", id: "fixture.Child" };
const unrelated = { kind: "target-named", id: "fixture.Other" };
const scalar = { kind: "source-primitive", name: "uint64" };
const host = {
  projectTypeCatalog: { definitionForTarget: carrier => carrier === base || carrier === child ? { kind: "class" } : undefined },
  projectTypes: () => ({ directSupertypes: carrier => carrier === child ? [base] : [] }),
  providers: { findTargetBindingByTargetId: () => undefined },
};

test("source result selection retains exact native and checked nominal carriers", () => {
  const result = selectCsharpSourceCallResult(host, base, () => child);
  assert.equal(result.nativeType, base);
  assert.equal(result.selectedType, child);
  assert.ok(Object.isFrozen(result));
  for (const selected of [base, unrelated, undefined]) {
    assert.deepEqual(selectCsharpSourceCallResult(host, base, () => selected), { nativeType: base, selectedType: base });
  }
  assert.deepEqual(selectCsharpSourceCallResult(host, scalar, () => assert.fail("native scalar result must not be reinterpreted")),
    { nativeType: scalar, selectedType: scalar });
  assert.equal(selectCsharpSourceCallResult(host, undefined, () => child), undefined);
});

test("nominal result selection cannot invent inheritance or generic relationships", () => {
  const disconnected = { ...host, projectTypes: () => ({ directSupertypes: () => [] }) };
  assert.deepEqual(selectCsharpSourceCallResult(disconnected, base, () => child), { nativeType: base, selectedType: base });
  const differentBase = { ...host, projectTypes: () => ({ directSupertypes: carrier => carrier === child ? [unrelated] : [] }) };
  assert.deepEqual(selectCsharpSourceCallResult(differentBase, base, () => child), { nativeType: base, selectedType: base });
});
