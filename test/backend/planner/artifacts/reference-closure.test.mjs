import assert from "node:assert/strict";
import test from "node:test";
import { collectCsharpReferenceClosure } from "../../../../dist/backend/planner/artifacts/graph/object-shapes/reference-closure.js";

function shape(id, bases = [], overrides = {}) {
  return {
    targetType: { kind: "target-named", id },
    members: [],
    implements: bases.map(base => base.targetType),
    ...overrides,
  };
}

function collect(root, visible, capability = "reference-identity") {
  let visits = 0;
  const result = collectCsharpReferenceClosure({
    host: { objectShapes: { resolveTarget: () => root } },
    visibleObjectShapes() { visits++; return visible; },
  }, root.targetType, undefined, new Map(), capability);
  assert.equal(visits, 1);
  return result;
}

test("reference capabilities follow transitive, diamond and cyclic exact shape edges once", () => {
  const root = shape("Root");
  const left = shape("Left", [root]);
  const right = shape("Right", [root]);
  const leaf = shape("Leaf", [left, right]);
  root.implements = [leaf.targetType];
  const unrelated = shape("Other");
  const result = collect(root, [leaf, right, unrelated, root, left]);
  assert.equal(result.kind, "accepted");
  assert.deepEqual(new Set(result.shapes.values()), new Set([root, left, right, leaf]));
});

test("reference capabilities do not cross generic instantiation identities", () => {
  const numeric = shape("Box", [], {
    targetType: { kind: "target-named", id: "Box", typeArguments: [{ kind: "source-primitive", name: "int32" }] },
  });
  const text = shape("Box", [], {
    targetType: { kind: "target-named", id: "Box", typeArguments: [{ kind: "target-named", id: "System.String" }] },
  });
  const numericChild = shape("NumericChild", [numeric]);
  const textChild = shape("TextChild", [text]);
  const result = collect(numeric, [numericChild, textChild, text]);
  assert.equal(result.kind, "accepted");
  assert.deepEqual(new Set(result.shapes.values()), new Set([numeric, numericChild]));
});

test("reference closure rejects transitive value storage and unprotected frozen writes", () => {
  const root = shape("Root");
  const value = shape("Value", [root], {
    targetType: { kind: "target-named", id: "Value", csharpValueType: true },
  });
  assert.equal(collect(root, [value]).kind, "rejected");
  const bound = shape("Bound", [root], { members: [{ bound: true }] });
  assert.equal(collect(root, [bound], "js-freeze").kind, "rejected");
  assert.equal(collect(root, [bound], "reference-identity").kind, "accepted");
});
