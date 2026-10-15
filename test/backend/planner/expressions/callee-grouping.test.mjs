import assert from "node:assert/strict";
import test from "node:test";
import { applyCalleeTypeArguments } from "../../../../dist/backend/planner/expressions/target-members/selected-call/helpers.js";
import { printCsharpExpression } from "../../../../dist/print/source/index.js";

test("native invocation removes source grouping without creating a C# cast ambiguity", () => {
  const diagnostics = [];
  const identifier = { kind: "IdentifierName", name: "callback" };
  const grouped = { kind: "ParenthesizedExpression", expression: {
    kind: "ParenthesizedExpression", expression: identifier,
  } };
  const callee = applyCalleeTypeArguments(undefined, grouped, [], {}, diagnostics);
  assert.equal(callee === identifier, true);
  assert.equal(diagnostics.length, 0);
  assert.equal(printCsharpExpression({ kind: "InvocationExpression", callee,
    arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: 41 } }],
  }), "callback(41)");
});

test("grouped generic callees retain exact type arguments and compound evaluation precedence", () => {
  const diagnostics = [];
  const grouped = { kind: "ParenthesizedExpression", expression: { kind: "IdentifierName", name: "identity" } };
  const callee = applyCalleeTypeArguments(undefined, grouped, [{ kind: "source-primitive", name: "int64" }], {}, diagnostics);
  assert.equal(diagnostics.length, 0);
  assert.equal(printCsharpExpression({ kind: "InvocationExpression", callee, arguments: [] }), "identity<long>()");
  const conditional = { kind: "ConditionalExpression", condition: { kind: "IdentifierName", name: "present" },
    whenTrue: { kind: "IdentifierName", name: "first" }, whenFalse: { kind: "IdentifierName", name: "second" } };
  const selected = applyCalleeTypeArguments(undefined, { kind: "ParenthesizedExpression", expression: conditional }, [], {}, diagnostics);
  assert.equal(selected === conditional, true);
  assert.equal(printCsharpExpression({ kind: "InvocationExpression", callee: selected, arguments: [] }), "(present ? first : second)()");
  assert.equal(diagnostics.length, 0);
});
