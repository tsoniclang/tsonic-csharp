import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/selection.js";
import { selectCsharpFlowReadConversion } from "../../../dist/policy/conversions/selection/expression.js";
import { csharpRuntimeUnionProjectionMatches } from "../../../dist/analysis/conversions/validation.js";
import { csharpRuntimeUnionTargetType, csharpNullableTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";

const base = { kind: "target-named", id: "fixture.Base" };
const child = { kind: "target-named", id: "fixture.Child" };
const other = { kind: "target-named", id: "fixture.Other" };
const policy = {
  projectTypes: { directSupertypes: carrier => carrier === child ? [base] : [] },
  providers: { findTargetBindingByTargetId: () => undefined }, target: {},
};

test("native nominal relations compose with exact union payloads in both directions", () => {
  const union = csharpRuntimeUnionTargetType([csharpStringTargetType(), base]);
  const injected = selectCsharpConversion(policy, child, union, "implicit");
  assert.deepEqual(injected, { kind: "implicit", proof: "runtime-union-arm", armIndex: 1, armType: base,
    sourceToArm: { kind: "implicit", proof: "reference" } });
  for (const source of [union, csharpNullableTargetType(union)]) {
    const selected = { kind: "runtime-union-projection", path: [{ union, index: 1 }], armType: base,
      refinement: child, retainsAbsence: false };
    assert.deepEqual(selectCsharpConversion(policy, source, child, "explicit"), selected);
    assert.deepEqual(selectCsharpFlowReadConversion(policy, source, child), selected);
    assert.equal(csharpRuntimeUnionProjectionMatches(policy, source, child, selected), true);
    for (const changed of [{ ...selected, path: [{ union, index: 0 }] }, { ...selected, refinement: undefined },
      { ...selected, refinement: other }, { ...selected, armType: child }, { ...selected, retainsAbsence: true }]) {
      assert.equal(csharpRuntimeUnionProjectionMatches(policy, source, child, changed), false);
    }
    assert.equal(csharpRuntimeUnionProjectionMatches(policy, source, other, { ...selected, refinement: other }), false);
  }
  assert.equal(selectCsharpConversion(policy, union, child, "implicit").kind, "rejected");
});

test("nominal union selection cannot choose unrelated or ambiguous native payloads", () => {
  const union = csharpRuntimeUnionTargetType([base, other]);
  const multiple = { ...policy, projectTypes: { directSupertypes: carrier => carrier === child ? [base, other] : [] } };
  assert.equal(selectCsharpFlowReadConversion(multiple, union, child).kind, "rejected");
  assert.equal(selectCsharpConversion(multiple, child, union, "implicit").kind, "rejected");
  const exact = csharpRuntimeUnionTargetType([child, base]);
  const selected = selectCsharpFlowReadConversion(policy, exact, child);
  assert.deepEqual(selected.path, [{ union: exact, index: 0 }]);
  assert.equal(selected.refinement, undefined);
  const unrelated = csharpRuntimeUnionTargetType([csharpStringTargetType(), other]);
  assert.equal(selectCsharpFlowReadConversion(policy, unrelated, child).kind, "rejected");
});
