import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpEmptyRecordConversion } from "../../../dist/policy/conversions/selection/empty-record.js";
import { csharpEmptyObjectTargetType } from "../../../dist/target-model/types/runtime-carriers.js";

test("empty-record conversion requires exact fieldless value facts", () => {
  const object = csharpEmptyObjectTargetType();
  const value = { kind: "target-named", id: "source.Empty", csharpSourceDeclarationKind: "struct" };
  const input = { objectShapes: { resolveTarget: type => type === value
    ? { targetType: value, members: [] } : undefined } };
  assert.deepEqual(selectCsharpEmptyRecordConversion(input, value, object), { kind: "empty-record", source: value, target: object });
  assert.deepEqual(selectCsharpEmptyRecordConversion(input, object, value), { kind: "empty-record", source: object, target: value });
  for (const shape of [undefined, { targetType: value, members: [{}] },
    { targetType: value, members: [], implements: [{}] }, { targetType: object, members: [] }]) {
    assert.equal(selectCsharpEmptyRecordConversion({ objectShapes: { resolveTarget: () => shape } }, value, object), undefined);
  }
  for (const type of [{ kind: "source-primitive", name: "float64" },
    { ...value, csharpSourceDeclarationKind: "class" }, { ...object, typeArguments: [value] }]) {
    assert.equal(selectCsharpEmptyRecordConversion(input, type, object), undefined);
  }
});
