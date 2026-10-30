import assert from "node:assert/strict";
import test from "node:test";
import { completeCsharpSourceCallAdoption, selectCsharpSourceCallResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import { csharpTsValueTargetType, csharpEmptyObjectTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const base = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Base" };
const child = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Child" };
const unrelated = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Other" };
const scalar = { kind: "source-primitive", name: "uint64" };
const host = {
  projectTypeCatalog: { definitionForTarget: carrier => carrier === base || carrier === child ? { kind: "class" } : undefined },
  projectTypes: () => ({ directSupertypes: carrier => carrier === child ? [base] : [] }),
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
};

test("a completed declared source call records exactly one native Task unwrapping", () => {
  const payload = csharpTaskTargetType(scalar);
  const nativeType = csharpTaskTargetType(payload);
  const raw = selectCsharpSourceCallResult(host, nativeType, () => assert.fail("raw native signature is exact"));
  assert.equal(raw.selectedType === nativeType && raw.completion === undefined, true,
    "a native signature does not gain source adoption merely from its Task shape");
  const selected = completeCsharpSourceCallAdoption(host, raw);
  assert.equal(selected.nativeType === nativeType && selected.selectedType === payload &&
    selected.completion.form === "direct" && selected.completion.result === scalar, true,
  "the source boundary records its one missing native Unwrap with original ABI and payload identity");
  assert.equal(selectCsharpAwaitCompletion(nativeType).result === payload, true,
    "the generic native await remains exactly one layer");
});

test("a declared source Task union records its own post-await arm completion without changing the physical ABI", () => {
  const payload = csharpRuntimeUnionTargetType([csharpTaskTargetType(scalar), scalar]);
  const nativeType = csharpTaskTargetType(payload);
  const raw = selectCsharpSourceCallResult(host, nativeType, () => assert.fail("raw native signature is exact"));
  const selected = completeCsharpSourceCallAdoption(host, raw);
  assert.equal(selected.nativeType === nativeType && targetTypeRefEquals(selected.selectedType, nativeType), true,
    "the real returned Task and its union payload are not copied or coerced");
  const awaited = selectCsharpAwaitCompletion(selected.selectedType);
  assert.equal(awaited.adoption.native.result === payload && awaited.adoption.continuation === selected.completion &&
    targetTypeRefEquals(awaited.result, scalar), true,
  "the same immutable declaration-owned operation supplies the native outer await and selected arm await");
  assert.equal(selectCsharpAwaitCompletion(nativeType).result === payload, true,
    "an undecorated native Task preserves its exact union TResult");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.completion) && Object.isFrozen(awaited.adoption), true);
});

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
