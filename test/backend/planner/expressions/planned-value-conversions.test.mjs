import assert from "node:assert/strict";
import test from "node:test";
import { convertCsharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-value-conversions.js";
import { csharpPlannedValue, csharpPlannedEffect } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpVoidTargetType, csharpNeverTargetType } from "../../../../dist/target-model/types/scalar-types.js";
import { csharpNullableTargetType } from "../../../../dist/target-model/types/nullable.js";

const integer = { kind: "source-primitive", name: "uint64" };
const identifier = { kind: "IdentifierName", name: "exact" };
const prelude = [{ kind: "ExpressionStatement", expression: {
  kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "observe" }, arguments: [],
} }];
const node = {};
const input = selection => ({ scope: {}, program: {
  source: { ast: { pos: () => 0, end: () => 1, getSourceFile: () => undefined } },
  conversions: { select: selection },
} });

test("planned completion identity and never preserve native evaluation without conversion", () => {
  const context = input(() => assert.fail("identity and never require no conversion"));
  const present = csharpPlannedValue(integer, identifier, prelude);
  const stopped = csharpPlannedEffect(csharpNeverTargetType(), prelude);
  assert.equal(convertCsharpPlannedValue(node, node, context, [], present, integer, "implicit"), present);
  assert.equal(convertCsharpPlannedValue(node, node, context, [], stopped, integer, "implicit"), stopped);
});

test("planned native optional injection queries the actual completion carrier and selected mode", () => {
  const target = csharpNullableTargetType(integer);
  const context = input((source, destination, mode) => {
    assert.equal(source, integer);
    assert.equal(destination, target);
    assert.equal(mode, "implicit");
    return { kind: "identity" };
  });
  const diagnostics = [];
  const result = convertCsharpPlannedValue(node, node, context, diagnostics,
    csharpPlannedValue(integer, identifier, prelude), target, "implicit");
  assert.equal(diagnostics.length, 0);
  assert.equal(result.completion.carrier, target);
  assert.equal(result.completion.expression, identifier);
  assert.deepEqual(result.prelude, prelude);
});

test("void completion preserves effects and admits only a native absence destination", () => {
  const context = input(() => ({ kind: "rejected", reason: "void is not a value" }));
  const effect = csharpPlannedEffect(csharpVoidTargetType(), prelude);
  const diagnostics = [];
  const optional = convertCsharpPlannedValue(node, node, context, diagnostics, effect,
    csharpNullableTargetType(integer), "implicit");
  assert.deepEqual(optional.prelude, prelude);
  assert.equal(optional.completion.expression.kind, "DefaultExpression");
  assert.equal(convertCsharpPlannedValue(node, node, context, diagnostics, effect, integer, "implicit") === undefined, true);
});

test("planned conversion does not relabel an unavailable sealed carrier relation", () => {
  const diagnostics = [];
  const result = convertCsharpPlannedValue(node, node, input(() => undefined), diagnostics,
    csharpPlannedValue(integer, identifier, prelude), csharpNullableTargetType(integer), "implicit");
  assert.equal(result === undefined, true);
  assert.equal(diagnostics.length, 1);
});
