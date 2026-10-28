import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceCallResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import { selectCsharpUnionArmMapping } from "../../../dist/policy/conversions/union-relations.js";
import {
  csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTaskTargetType,
} from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("uint64");
const string = csharpStringTargetType();
const boolean = csharpSourcePrimitiveTargetType("bool");
const floating = csharpSourcePrimitiveTargetType("float64");
const base = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Base" };
const child = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Child" };
const other = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Other" };
const host = {
  projectTypeCatalog: {
    definitionForTarget: type => [base.id, child.id, other.id].includes(type.id) ? { kind: "class" } : undefined,
  },
  projectTypes: () => ({ directSupertypes: type => type.id === child.id ? [base] : [] }),
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
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

test("complete equal native payload coverage preserves the physical call ABI", () => {
  const duplicate = csharpRuntimeUnionTargetType([integer, integer]);
  const result = selectCsharpSourceCallResult(host, duplicate, () => integer);
  assert.equal(result.nativeType === duplicate, true, "the original native union ABI is retained");
  assert.equal(result.selectedType === integer, true, "complete coverage selects the exact native uint64");
  const mapping = selectCsharpUnionArmMapping(duplicate, integer, "source");
  assert.equal(mapping?.length, 2, "both physical source slots are covered");
  assert.equal(mapping.every(arm => arm.carrier === integer && arm.target.length === 0 &&
    arm.source.length === 1 && arm.source[0].union === duplicate), true,
  "each exact source payload maps to the scalar without a destination tag");
  assert.equal(mapping.map(arm => arm.source[0].index).join(","), "0,1", "source paths remain distinct and ordered");
  assert.equal(selectCsharpUnionArmMapping(duplicate, floating, "source") === undefined, true,
    "complete source coverage cannot reinterpret the native integer width");
  assert.equal(selectCsharpUnionArmMapping(csharpRuntimeUnionTargetType([integer, string]), integer, "source") === undefined, true,
    "a heterogeneous source cannot be collapsed to one selected payload");
  expectSelection(duplicate, integer);
  expectSelection(duplicate, floating, duplicate);
});

test("ambiguous and cyclic closed results cannot invent an exact selected payload", () => {
  const native = csharpRuntimeUnionTargetType([integer, string]);
  const ambiguous = csharpRuntimeUnionTargetType([integer, integer]);
  expectSelection(native, ambiguous, native);
  const cycle = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Cycle" };
  const cyclic = { ...host, typeDefinitions: { sourceUnionArms: type => type.id === cycle.id ? [cycle] : undefined } };
  expectSelection(cycle, integer, cycle, cyclic);
});
