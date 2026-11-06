import assert from "node:assert/strict";
import test from "node:test";
import { csharpArrayInputDomainsEqual } from "../../../dist/policy/types/collections/array-input-layout.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const floating = csharpSourcePrimitiveTargetType("float64");
const unsigned = csharpSourcePrimitiveTargetType("uint32");
const sourceSum = (...arms) => Object.freeze({ ...csharpRuntimeUnionTargetType(arms), csharpRuntimeUnionSemantics: "source-sum" });
const array = (element, rank = 1) => Object.freeze({ kind: "array", element, rank });

test("array input layout retains the exact physical source-sum arm multiset on both carriers", () => {
  const source = sourceSum(integer, floating, unsigned);
  const target = sourceSum(unsigned, integer, floating);
  for (const carrier of [array, csharpJsArrayTargetType]) {
    assert.equal(csharpArrayInputDomainsEqual(carrier(source), carrier(target)), true);
    assert.equal(csharpArrayInputDomainsEqual(carrier(target), carrier(source)), true);
  }
});

test("array layout substitution preserves duplicate native payload slots", () => {
  const source = sourceSum(integer, integer, floating);
  const target = sourceSum(floating, integer, integer);
  assert.equal(csharpArrayInputDomainsEqual(array(source), array(target)), true);
  assert.equal(csharpArrayInputDomainsEqual(array(source), array(sourceSum(integer, floating))), false);
  assert.equal(csharpArrayInputDomainsEqual(array(source), array(sourceSum(integer, floating, floating))), false);
});

test("array input layout never changes width rank carrier or ordered native-union semantics", () => {
  const source = sourceSum(integer, unsigned);
  for (const [left, right] of [
    [undefined, array(source)],
    [array(source), undefined],
    [array(source), array(sourceSum(integer, floating))],
    [array(source, 1), array(source, 2)],
    [array(source), csharpJsArrayTargetType(source)],
    [array(csharpRuntimeUnionTargetType([integer, unsigned])), array(csharpRuntimeUnionTargetType([unsigned, integer]))],
  ]) assert.equal(csharpArrayInputDomainsEqual(left, right), false);
});

test("array layout never substitutes a distinct native object or opaque parameter identity", () => {
  const first = Object.freeze({ kind: "target-named", id: "project:First" });
  const second = Object.freeze({ kind: "target-named", id: "project:Second" });
  const outer = Object.freeze({ kind: "type-parameter", identity: "outer:Value", name: "Value" });
  const inner = Object.freeze({ kind: "type-parameter", identity: "inner:Value", name: "Value" });
  assert.equal(csharpArrayInputDomainsEqual(array(sourceSum(first, integer)), array(sourceSum(second, integer))), false);
  assert.equal(csharpArrayInputDomainsEqual(array(sourceSum(outer, integer)), array(sourceSum(inner, integer))), false);
});
