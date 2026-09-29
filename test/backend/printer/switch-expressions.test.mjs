import assert from "node:assert/strict";
import test from "node:test";
import { printCsharpExpression } from "../../../dist/print/source/index.js";
import { expressionRequiresUnsafe, expressionRequiresUnsafePermission } from "../../../dist/backend/planner/safety/unsafe-expressions.js";

test("native switch expressions preserve patterns, guards and receiver precedence", () => {
  const expression = { kind: "SwitchExpression", expression: { kind: "IdentifierName", name: "input" }, arms: [
    { pattern: { kind: "ConstantPattern", expression: { kind: "LiteralExpression", value: null } },
      expression: { kind: "LiteralExpression", value: "object" } },
    { pattern: { kind: "DeclarationPattern", type: { kind: "PredefinedType", name: "string" }, designation: "text" },
      expression: { kind: "LiteralExpression", value: "string" } },
    { pattern: { kind: "VarPattern", designation: "value" }, when: { kind: "LiteralExpression", value: true },
      expression: { kind: "LiteralExpression", value: "other" } },
    { pattern: { kind: "DiscardPattern" }, expression: { kind: "ThrowExpression", expression: { kind: "IdentifierName", name: "error" } } },
  ] };
  assert.equal(printCsharpExpression(expression), '(input) switch { null => "object", string text => "string", var value when true => "other", _ => throw error }');
  assert.equal(printCsharpExpression({ kind: "SimpleMemberAccessExpression", receiver: expression, name: "Length" }),
    `(${printCsharpExpression(expression)}).Length`);
  assert.equal(printCsharpExpression({ kind: "PrefixUnaryExpression", operand: expression, operatorToken: { kind: "ExclamationToken" } }),
    `!(${printCsharpExpression(expression)})`);
  assert.equal(printCsharpExpression({ kind: "AwaitExpression", expression }), `await (${printCsharpExpression(expression)})`);
  const unsafe = { ...expression, arms: [{ pattern: { kind: "DiscardPattern" }, expression: {
    kind: "PrefixUnaryExpression", operand: { kind: "IdentifierName", name: "pointer" }, operatorToken: { kind: "AsteriskToken" },
  } }] };
  assert.equal(expressionRequiresUnsafe(unsafe, () => false), true);
  assert.equal(expressionRequiresUnsafePermission(unsafe, () => false), true);
  assert.equal(expressionRequiresUnsafe(expression, () => false), false);
});
