import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpNativeFieldBacking } from "../../../dist/analysis/storage/native-field-backing.js";

const integer = { kind: "source-primitive", name: "uint32" };
const field = {
  sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
  memberKind: "property", type: integer,
};
const layout = { kind: "scalar", pointeeType: integer, size: 4, alignment: 4, width: 64, littleEndian: true, fields: [] };
const shape = (name, bases = [], members = [field]) => ({
  targetType: { kind: "target-named", id: `tsonic.shape:${name}` }, members, implements: bases,
});

test("native field requirements reach transitive and diamond implementations without storage-name collisions", () => {
  const root = shape("root");
  const left = shape("left", [root.targetType]);
  const right = shape("right", [root.targetType]);
  const concrete = shape("concrete", [left.targetType, right.targetType], [field, {
    ...field, sourceKey: { kind: "property", name: "valueLocation" }, sourceName: "valueLocation", targetName: "valueLocation",
  }]);
  const unrelated = shape("unrelated");
  const index = createCsharpNativeFieldBacking([root, left, right, concrete, unrelated]);
  assert.deepEqual(index.select(root, field, layout), { kind: "resolved" });
  for (const owner of [root, left, right, concrete]) {
    const backing = index.get(owner.targetType, "value");
    assert.deepEqual(backing.layout, layout);
    assert.equal(backing.storageName, "valueLocation_2");
  }
  assert.equal(index.get(unrelated.targetType, "value"), undefined);
  assert.equal(index.values().length, 4);
  assert.deepEqual(index.select(concrete, field, layout), { kind: "resolved" });
  assert.equal(index.values().length, 4);
});

test("native field closure separates generic identities and terminates on cycles", () => {
  const root = shape("generic");
  root.targetType.typeArguments = [integer];
  const other = shape("generic");
  other.targetType.typeArguments = [{ kind: "source-primitive", name: "int32" }];
  const child = shape("child", [root.targetType]);
  root.implements = [child.targetType];
  const index = createCsharpNativeFieldBacking([root, other, child]);
  assert.deepEqual(index.select(root, field, layout), { kind: "resolved" });
  assert.equal(index.values().length, 2);
  assert.equal(index.get(other.targetType, "value"), undefined);
});

test("native field closure rejects incompatible implementations and layouts transactionally", () => {
  const root = shape("root");
  for (const changed of [{ readonly: true }, { accessor: { getter: true, setter: true } },
    { optional: true }, { bound: true }, { type: { kind: "source-primitive", name: "int32" } }]) {
    const child = shape("child", [root.targetType], [{ ...field, ...changed }]);
    const index = createCsharpNativeFieldBacking([root, child]);
    assert.equal(index.select(root, field, layout).kind, "rejected");
    assert.deepEqual(index.values(), []);
  }
  const index = createCsharpNativeFieldBacking([root]);
  assert.equal(index.select(root, field, layout).kind, "resolved");
  assert.equal(index.select(root, field, { ...layout, littleEndian: false }).kind, "rejected");
  assert.deepEqual(index.get(root.targetType, "value").layout, layout);
});
