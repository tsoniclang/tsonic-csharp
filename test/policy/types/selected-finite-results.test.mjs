import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceCallResult } from "../../../dist/policy/types/resolution/call-results.js";
import {
  csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTaskTargetType,
} from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("uint64");
const string = csharpStringTargetType();
const boolean = csharpSourcePrimitiveTargetType("bool");
const floating = csharpSourcePrimitiveTargetType("float64");
const base = { kind: "target-named", id: "fixture.Base" };
const child = { kind: "target-named", id: "fixture.Child" };
const other = { kind: "target-named", id: "fixture.Other" };
const host = {
  projectTypeCatalog: {
    definitionForTarget: type => [base.id, child.id, other.id].includes(type.id) ? { kind: "class" } : undefined,
  },
  projectTypes: () => ({ directSupertypes: type => type.id === child.id ? [base] : [] }),
  providers: { findTargetBindingByTargetId: () => undefined },
  target: {},
};

function expectSelection(nativeType, selectedType, retained = selectedType, input = host) {
  let queries = 0;
  const result = selectCsharpSourceCallResult(input, nativeType, () => {
    queries++;
    return selectedType;
  });
  assert.deepEqual(result, { nativeType, selectedType: retained });
  assert.ok(Object.isFrozen(result));
  assert.equal(queries, 1);
}

test("checked closed result projection retains exact overload payloads and native widths", () => {
  const native = csharpRuntimeUnionTargetType([integer, string, boolean]);
  for (const selected of [integer, string, boolean]) expectSelection(native, selected);
  expectSelection(native, csharpRuntimeUnionTargetType([string, integer]));
  expectSelection(native, floating, native);
  expectSelection(native, other, native);
  expectSelection(native, undefined, native);
});

test("checked optional results retain one absence and reject payload reinterpretation", () => {
  for (const payload of [integer, string, csharpTaskTargetType(integer)]) {
    const native = csharpNullableTargetType(payload);
    expectSelection(native, payload);
    expectSelection(native, native);
  }
  const native = csharpNullableTargetType(integer);
  expectSelection(native, floating, native);
  expectSelection(native, csharpNullableTargetType(floating), native);
  expectSelection(csharpNullableTargetType(floating), csharpSourcePrimitiveTargetType("int32"), csharpNullableTargetType(floating));
});

test("checked optional closed results project exact leaves and subsets without changing Task results", () => {
  const task = csharpTaskTargetType(integer);
  const native = csharpNullableTargetType(csharpRuntimeUnionTargetType([task, string, integer]));
  expectSelection(native, task);
  expectSelection(native, csharpNullableTargetType(string));
  expectSelection(native, csharpNullableTargetType(csharpRuntimeUnionTargetType([string, integer])));
  expectSelection(native, csharpTaskTargetType(string), native);
});

test("selected nominal and optional this results require the existing exact inheritance proof", () => {
  expectSelection(base, child);
  expectSelection(csharpNullableTargetType(base), child);
  expectSelection(csharpNullableTargetType(base), csharpNullableTargetType(child));
  expectSelection(csharpNullableTargetType(base), other, csharpNullableTargetType(base));
  expectSelection(csharpNullableTargetType(base), child, csharpNullableTargetType(base), {
    ...host, projectTypes: () => ({ directSupertypes: () => [] }),
  });
});

test("native scalar results remain authoritative without evaluating selected source-number evidence", () => {
  for (const native of [integer, floating, string, csharpTaskTargetType(integer)]) {
    assert.deepEqual(selectCsharpSourceCallResult(host, native, () => assert.fail("physical scalar authority must not change")),
      { nativeType: native, selectedType: native });
  }
});

test("ambiguous and cyclic closed results cannot invent an exact selected payload", () => {
  const duplicate = csharpRuntimeUnionTargetType([integer, integer]);
  expectSelection(duplicate, integer, duplicate);
  const cycle = { kind: "target-named", id: "fixture.Cycle" };
  const cyclic = { ...host, typeDefinitions: { sourceUnionArms: type => type.id === cycle.id ? [cycle] : undefined } };
  expectSelection(cycle, integer, cycle, cyclic);
});
