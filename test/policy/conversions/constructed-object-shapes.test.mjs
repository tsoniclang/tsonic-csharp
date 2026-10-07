import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpExpressionConversion } from "../../../dist/policy/conversions/selection/expression.js";

const source = { kind: "target-named", id: "source.Constructed" };
const target = { kind: "target-named", id: "source.Contract" };
const expression = {};
const policy = {
  ast: { is: { IsArrayLiteralExpression: () => false } },
  projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => undefined },
  target: {},
};

test("constructed object conversions use the exact produced shape before contextual source-node shape", () => {
  const input = { ...policy, objectShapes: {
    resolveTarget: carrier => carrier === source ? { targetType: source, implements: [target] } : undefined,
    resolveNode: () => ({ targetType: { kind: "target-named", id: "source.Contextual" }, implements: [] }),
  } };
  const selected = selectCsharpExpressionConversion(input, expression, source, target, "implicit");
  assert.equal(selected.kind, "implicit");
  assert.equal(selected.proof, "object-shape-interface");
});

test("constructed object conversions reject missing, mismatched and nonimplementing shape evidence", () => {
  for (const shape of [undefined, { targetType: target, implements: [target] },
    { targetType: source, implements: [] }, { targetType: source, implements: [{ ...target, id: "source.Other" }] }]) {
    const input = { ...policy, objectShapes: { resolveTarget: () => shape, resolveNode: () => undefined } };
    assert.equal(selectCsharpExpressionConversion(input, expression, source, target, "implicit").kind, "rejected",
      "a shape name or physical representation never substitutes for exact implementation evidence");
  }
});
