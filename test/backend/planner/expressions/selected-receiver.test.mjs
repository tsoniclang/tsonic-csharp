import assert from "node:assert/strict";
import test from "node:test";
import { translateCsharpSelectedReceiver } from "../../../../dist/backend/planner/expressions/receivers.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/scalar-types.js";
import { csharpNullableReferenceTargetType } from "../../../../dist/target-model/types/nullable.js";

test("selected receiver projections consume an already-selected planned value exactly once", () => {
  const selected = csharpStringTargetType();
  const storage = csharpNullableReferenceTargetType(selected);
  const node = {};
  const value = { kind: "PostfixUnaryExpression", operatorToken: { kind: "ExclamationToken" },
    operand: { kind: "IdentifierName", name: "selected" } };
  const prelude = [{ kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name: "effect" }, arguments: [] } }];
  const planned = csharpPlannedValue(selected, value, prelude);
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression: node, type: {} }, {}, {}, diagnostics,
    () => planned, { source: storage, target: selected, conversion: { kind: "nullable-reference" } });
  assert.equal(result === planned, true, "no second null suppression or duplicated effects");
  assert.equal(result.prelude.length, 1);
  assert.equal(diagnostics.length, 0);
});

test("selected receiver projections reject an unrelated planned carrier rather than applying a stale conversion", () => {
  const selected = csharpStringTargetType();
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression: {}, type: {} }, {}, {}, diagnostics,
    () => csharpPlannedValue(csharpSourcePrimitiveTargetType("int32"), { kind: "LiteralExpression", value: 1 }),
    { source: csharpNullableReferenceTargetType(selected), target: selected, conversion: { kind: "nullable-reference" } });
  assert.equal(result === undefined, true);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /exact planned completion carrier/u);
});

test("selected receiver projections never hide rejected evidence behind an already-selected carrier", () => {
  const selected = csharpStringTargetType();
  const diagnostics = [];
  const result = translateCsharpSelectedReceiver({ expression: {}, type: {} }, {}, {}, diagnostics,
    () => csharpPlannedValue(selected, { kind: "IdentifierName", name: "value" }),
    { source: csharpNullableReferenceTargetType(selected), target: selected,
      conversion: { kind: "rejected", reason: "missing selected proof" } });
  assert.equal(result === undefined, true);
  assert.equal(diagnostics.length, 1);
});
