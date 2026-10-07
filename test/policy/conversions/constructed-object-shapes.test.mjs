import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpExpressionConversion } from "../../../dist/policy/conversions/selection/expression.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";

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

test("constructed structural references widen absence without implicitly removing it", () => {
  const input = { ...policy, objectShapes: {
    resolveTarget: () => ({ targetType: source, implements: [target] }),
    resolveNode: () => undefined,
  } };
  const optionalSource = csharpNullableTargetType(source);
  const optionalTarget = csharpNullableTargetType(target);
  for (const from of [source, optionalSource]) {
    const selected = selectCsharpExpressionConversion(input, expression, from, optionalTarget, "implicit");
    assert.equal(selected.kind, "implicit");
    assert.equal(selected.proof, "object-shape-interface");
  }
  assert.equal(selectCsharpExpressionConversion(input, expression, optionalSource, target, "implicit").kind, "rejected");
  assert.equal(selectCsharpExpressionConversion(input, expression, source,
    csharpNullableTargetType({ ...target, id: "source.Unrelated" }), "implicit").kind, "rejected");
});

test("constructed object conversions reject missing, mismatched and nonimplementing shape evidence", () => {
  for (const shape of [undefined, { targetType: target, implements: [target] },
    { targetType: source, implements: [] }, { targetType: source, implements: [{ ...target, id: "source.Other" }] }]) {
    const input = { ...policy, objectShapes: { resolveTarget: () => shape, resolveNode: () => undefined } };
    assert.equal(selectCsharpExpressionConversion(input, expression, source, target, "implicit").kind, "rejected",
      "a shape name or physical representation never substitutes for exact implementation evidence");
  }
});
