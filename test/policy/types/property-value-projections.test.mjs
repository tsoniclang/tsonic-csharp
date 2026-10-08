import assert from "node:assert/strict";
import test from "node:test";
import { resolveCsharpObjectShapePropertyOrder, csharpObjectShapeProjectionMembers } from "../../../dist/target-model/types/object-shape-projection.js";
import { csharpTsValueTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { requireObjectShapeProjection } from "../../../dist/backend/planner/artifacts/graph/object-shapes/requests.js";

test("checked property projection retains exact native fields and does not select JSON methods", () => {
  const count = { sourceKey: { kind: "property", name: "count" }, sourceName: "count", targetName: "storedCount",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("uint64"), optional: true };
  const grouping = { sourceKey: { kind: "property", name: "useGrouping" }, sourceName: "useGrouping", targetName: "grouping",
    memberKind: "property", type: csharpSourcePrimitiveTargetType("bool"), accessor: { getter: true, setter: false } };
  const method = { sourceKey: { kind: "property", name: "toJSON" }, sourceName: "toJSON", targetName: "jsonMethod",
    memberKind: "method", type: csharpStringTargetType() };
  const shape = { targetType: { kind: "target-named", id: "Options", csharpSourceDeclarationKind: "class" },
    members: [count, method, grouping] };
  const selected = resolveCsharpObjectShapePropertyOrder(shape, undefined, "properties", {}, ["count", "useGrouping"]);
  assert.equal(selected.kind, "resolved");
  assert.deepEqual(selected.propertyOrder, ["count", "useGrouping"]);
  const projection = { kind: "properties", resultType: csharpTsValueTargetType(), propertyOrder: selected.propertyOrder };
  const members = csharpObjectShapeProjectionMembers(shape, projection);
  assert.equal(members[0] === count && members[1] === grouping, true, "exact native member identity");
  assert.equal(resolveCsharpObjectShapePropertyOrder(shape, undefined, "keys", {}).kind, "rejected",
    "property consumption does not weaken enumerable own-set proof");
  for (const order of [["count", "count"], ["count", "toJSON"], ["count", "missing"]]) {
    assert.equal(csharpObjectShapeProjectionMembers(shape, { ...projection, propertyOrder: order }) === undefined,
      true, order.join(","));
  }
  const duplicated = { ...shape, members: [...shape.members, count] };
  assert.equal(resolveCsharpObjectShapePropertyOrder(duplicated, undefined, "properties", {}, ["count"]).kind, "rejected");
  assert.equal(resolveCsharpObjectShapePropertyOrder(shape, undefined, "properties", {}).kind, "rejected",
    "the removed all-properties projection cannot invent selected-parameter demand");
  const subset = resolveCsharpObjectShapePropertyOrder(shape, undefined, "properties", {}, ["useGrouping"]);
  assert.equal(subset.kind, "resolved");
  assert.equal(csharpObjectShapeProjectionMembers(shape, { ...projection, propertyOrder: subset.propertyOrder })[0] === grouping,
    true, "only the exactly selected property is consumed");
  for (const order of [["count", "count"], ["toJSON"], ["missing"]]) {
    assert.equal(resolveCsharpObjectShapePropertyOrder(shape, undefined, "properties", {}, order).kind, "rejected");
  }
  assert.equal(requireObjectShapeProjection({}, undefined, shape.targetType, {}, "properties", csharpStringTargetType(),
    "object-shape").kind, "rejected", "wrong result rejects before artifact publication");
});
