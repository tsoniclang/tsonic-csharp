import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpUnionEquality } from "../../../dist/policy/operations/operators/union-equality.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { csharpUnionEqualityArmsEqual } from "../../../dist/target-model/operations/binary.js";

test("union equality covers nested leaf pairs without inventing operations for opaque types", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const text = csharpStringTargetType();
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const inner = csharpRuntimeUnionTargetType([integer, text]);
  const outer = csharpRuntimeUnionTargetType([inner, boolean]);
  const input = { providers: { findTargetBindingByTargetId() {} }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const selected = selectCsharpUnionEquality(outer, outer, input);
  assert.equal(selected.length, 3);
  assert.deepEqual(selected.map(arm => arm.left.path.map(step => step.index)), [[0, 0], [0, 1], [1]]);
  assert.ok(Object.isFrozen(selected) && selected.every(arm => Object.isFrozen(arm) && Object.isFrozen(arm.operation)));
  assert.ok(csharpUnionEqualityArmsEqual(selected, selectCsharpUnionEquality(outer, outer, input)));
  for (const other of [undefined, [], selected.toReversed(), [...selected, selected[0]],
    [{ ...selected[0], left: { ...selected[0].left, path: [] } }, ...selected.slice(1)],
    [{ ...selected[0], operation: { kind: "operator", leftInputType: text, rightInputType: text } }, ...selected.slice(1)]]) {
    assert.equal(csharpUnionEqualityArmsEqual(selected, other), false);
  }
  assert.throws(() => { selected[0].operation.kind = "reference-identity"; }, TypeError);
  assert.equal(selectCsharpUnionEquality(outer, { kind: "type-parameter", identity: "opaque", name: "Opaque" }, input), undefined);
  assert.equal(selectCsharpUnionEquality(integer, text, input), undefined);
});
