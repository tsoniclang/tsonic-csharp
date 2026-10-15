import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpTargetNamedType } from "../../../dist/policy/types/index.js";

const reference = name => csharpTargetNamedType(name, undefined, { kind: "named", name });
const base = reference("Base");
const first = reference("First");
const second = reference("Second");
const unrelated = reference("Unrelated");
const host = {
  projectTypes: { directSupertypes: type => type === first || type === second ? [base] : [] },
  providers: { findTargetBindingByTargetId: () => undefined },
  target: {},
};

test("class union upcasts require every exact reference arm to reach the selected base", () => {
  const source = csharpRuntimeUnionTargetType([first, second]);
  for (const target of [base, csharpNullableTargetType(base)]) {
    for (const mode of ["implicit", "explicit"]) {
      const selected = selectCsharpConversion(host, source, target, mode);
      assert.equal(selected.kind, "runtime-union-reference");
      assert.deepEqual(selected.arms, [first, second]);
      assert.deepEqual(selected.target, target);
    }
  }
  assert.equal(selectCsharpConversion(host, csharpRuntimeUnionTargetType([first, unrelated]), base, "implicit").kind, "rejected");
});

test("class union upcasts do not erase nullable arms or invent value-type boxing", () => {
  const nullable = csharpRuntimeUnionTargetType([csharpNullableTargetType(first), second]);
  assert.equal(selectCsharpConversion(host, nullable, base, "implicit").kind, "rejected");
  const value = csharpTargetNamedType("Record", undefined, { kind: "named", name: "Record" }, { valueType: true });
  assert.equal(selectCsharpConversion(host, csharpRuntimeUnionTargetType([value, second]), base, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(host, csharpRuntimeUnionTargetType([first, second]), unrelated, "explicit").kind, "rejected");
});
