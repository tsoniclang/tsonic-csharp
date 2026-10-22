import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceCallResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import { csharpTsValueTargetType, csharpEmptyObjectTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const base = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Base" };
const child = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Child" };
const unrelated = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Other" };
const scalar = { kind: "source-primitive", name: "uint64" };
const host = {
  projectTypeCatalog: { definitionForTarget: carrier => carrier === base || carrier === child ? { kind: "class" } : undefined },
  projectTypes: () => ({ directSupertypes: carrier => carrier === child ? [base] : [] }),
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
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

test("broad native results retain exact selected overload results without changing native scalar carriers", () => {
  const native = csharpTsValueTargetType();
  for (const selectedType of [scalar, { kind: "source-primitive", name: "float64" }, child, native]) {
    const result = selectCsharpSourceCallResult(host, native, () => selectedType);
    assert.deepEqual(result, { nativeType: native, selectedType });
    assert.ok(Object.isFrozen(result));
  }
  assert.deepEqual(selectCsharpSourceCallResult(host, native, () => csharpEmptyObjectTargetType()),
    { nativeType: native, selectedType: native });
  assert.equal(selectCsharpSourceCallResult(host, native, () => undefined), undefined);
  assert.deepEqual(selectCsharpSourceCallResult(host, scalar, () => assert.fail("exact scalar storage is authoritative")),
    { nativeType: scalar, selectedType: scalar });
});
