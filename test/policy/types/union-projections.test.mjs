import assert from "node:assert/strict";
import test from "node:test";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { csharpUnionProjectionPath } from "../../../dist/target-model/types/union-relations.js";
import { selectCsharpRuntimeUnionProjection } from "../../../dist/policy/conversions/selection/carriers.js";
import { csharpRuntimeUnionProjectionMatches } from "../../../dist/analysis/conversions/validation.js";

test("nested union payload paths are exact, immutable and independently checked", () => {
  const integer = csharpSourcePrimitiveTargetType("uint64");
  const string = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const inner = csharpRuntimeUnionTargetType([integer, string]);
  const nested = csharpRuntimeUnionTargetType([boolean, inner]);
  const path = csharpUnionProjectionPath(nested, integer);
  assert.deepEqual(path, [{ union: nested, index: 1 }, { union: inner, index: 0 }]);
  assert.ok(Object.isFrozen(path) && path.every(Object.isFrozen));
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() {} } };
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
  assert.equal(selectCsharpRuntimeUnionProjection(policy, nested, csharpNullableTargetType(integer)).kind, "rejected");
  assert.equal(csharpUnionProjectionPath(csharpRuntimeUnionTargetType([integer, inner]), integer), undefined);
  const cycle = csharpSourceUnionTargetType("fixture.Cycle", "Cycle", []);
  const definitions = { sourceUnionArms: carrier => carrier === cycle ? [cycle] : undefined };
  assert.equal(csharpUnionProjectionPath(cycle, integer, definitions), undefined);
});
