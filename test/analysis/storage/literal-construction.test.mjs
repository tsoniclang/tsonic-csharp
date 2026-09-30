import assert from "node:assert/strict";
import test from "node:test";
import { canConstructCsharpStorageLiteral } from "../../../dist/analysis/storage/literal-construction.js";

const element = { kind: "source-primitive", name: "int64" };
const array = { kind: "array", element };
const expression = { kind: "array", elements: [{ kind: "identifier" }] };
const policy = { ast: { is: {
  IsArrayLiteralExpression: node => node.kind === "array",
  IsObjectLiteralExpression: node => node.kind === "object",
  IsSpreadElement: node => node.kind === "spread",
}, elements: node => node.elements } };
const evidence = { nodeTargetType: node => node === expression ? array : element };
const shapes = {};

test("fresh storage construction requires the exact carrier and every element conversion", () => {
  const conversions = { selectExpression: (_node, actual, required, mode) => {
    assert.deepEqual(actual, element);
    assert.deepEqual(required, element);
    assert.equal(mode, "implicit");
    return { kind: "identity" };
  } };
  assert.equal(canConstructCsharpStorageLiteral(expression, array, policy, evidence, shapes, conversions), true);
  for (const selected of [undefined, { kind: "rejected", reason: "different width" }]) {
    assert.equal(canConstructCsharpStorageLiteral(expression, array, policy, evidence, shapes,
      { selectExpression: () => selected }), false);
  }
  assert.equal(canConstructCsharpStorageLiteral(expression, element, policy, evidence, shapes, conversions), false);
  for (const rejected of [undefined, { kind: "spread" }]) {
    assert.equal(canConstructCsharpStorageLiteral({ ...expression, elements: [rejected] }, array, policy, evidence,
      shapes, conversions), false);
  }
});
