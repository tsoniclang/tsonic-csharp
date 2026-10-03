import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpPlannedEffect,
  csharpPlannedValue,
  mapCsharpPlannedValue,
  selectCsharpPlannedBranch,
  sequenceCsharpPlannedValues,
} from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpVoidTargetType, csharpNeverTargetType } from "../../../../dist/target-model/types/scalar-types.js";

const integer = { kind: "source-primitive", name: "int32" };
const boolean = { kind: "source-primitive", name: "boolean" };
const identifier = name => ({ kind: "IdentifierName", name });
const effect = name => ({ kind: "ExpressionStatement", expression: {
  kind: "InvocationExpression", callee: identifier(name), arguments: [],
} });
const capture = carrier => ({ name: "captured", type: { kind: "PredefinedType", name: carrier === boolean ? "bool" : "int" } });

test("planned native values keep pure composition expression-only", () => {
  const left = csharpPlannedValue(integer, identifier("left"));
  const right = csharpPlannedValue(integer, identifier("right"));
  const result = sequenceCsharpPlannedValues([left, right], () => assert.fail("a pure expression needs no temporary"), expressions =>
    csharpPlannedValue(integer, { kind: "BinaryExpression", operatorToken: { kind: "PlusToken" }, left: expressions[0], right: expressions[1] }));
  assert.deepEqual(result.prelude, []);
  assert.deepEqual(result.completion.expression.left, identifier("left"));
  assert.deepEqual(result.completion.expression.right, identifier("right"));
});

test("planned sequence captures earlier local reads before a later mutation region", () => {
  const earlier = csharpPlannedValue(integer, identifier("current"));
  const later = csharpPlannedValue(integer, identifier("completed"), [effect("mutate")]);
  const result = sequenceCsharpPlannedValues([earlier, later], capture, expressions => csharpPlannedValue(integer, {
    kind: "InvocationExpression", callee: identifier("consume"), arguments: expressions.map(expression => ({ kind: "Argument", expression })),
  }));
  assert.equal(result.prelude[0].kind, "LocalDeclarationStatement");
  assert.deepEqual(result.prelude[0].initializer, identifier("current"));
  assert.deepEqual(result.prelude[1], effect("mutate"));
  assert.deepEqual(result.completion.expression.arguments[0].expression, identifier("captured"));
});

test("native division cannot move after a later region merely because its source operands are pure", () => {
  const division = { kind: "BinaryExpression", operatorToken: { kind: "SlashToken" }, left: identifier("numerator"), right: identifier("denominator") };
  const result = sequenceCsharpPlannedValues([
    csharpPlannedValue(integer, division), csharpPlannedValue(integer, identifier("later"), [effect("suspend")]),
  ], capture, expressions => csharpPlannedValue(integer, expressions[0]));
  assert.deepEqual(result.prelude[0].initializer, division);
  assert.deepEqual(result.prelude[1], effect("suspend"));
});

test("native literals need no unnecessary capture but preserve all preceding effects", () => {
  const result = sequenceCsharpPlannedValues([
    csharpPlannedValue(integer, { kind: "LiteralExpression", value: 3 }, [effect("earlier")]),
    csharpPlannedValue(integer, identifier("later"), [effect("later")]),
  ], () => assert.fail("a literal is stable"), expressions => csharpPlannedValue(integer, expressions[0]));
  assert.deepEqual(result.prelude, [effect("earlier"), effect("later")]);
});

test("native termination preserves preceding evaluations and excludes later operands", () => {
  const stopped = csharpPlannedEffect(csharpNeverTargetType(), [{ kind: "ThrowStatement", expression: identifier("failure") }]);
  const result = sequenceCsharpPlannedValues([
    csharpPlannedValue(integer, identifier("earlier")), stopped, csharpPlannedValue(integer, identifier("later"), [effect("forbidden")]),
  ], capture, () => assert.fail("a terminated sequence has no value builder"));
  assert.equal(result.completion.kind, "never");
  assert.equal(result.prelude[0].kind, "LocalDeclarationStatement");
  assert.equal(result.prelude[1].kind, "ThrowStatement");
  assert.equal(result.prelude.length, 2);
});

test("statement-bearing branches remain selected, not eager", () => {
  const result = selectCsharpPlannedBranch(csharpPlannedValue(boolean, identifier("enabled"), [effect("condition")]),
    csharpPlannedValue(integer, identifier("completed"), [effect("selected")]),
    csharpPlannedValue(integer, identifier("fallback"), [effect("otherwise")]), integer, capture(integer));
  assert.deepEqual(result.prelude[0], effect("condition"));
  assert.equal(result.prelude[1].kind, "LocalDeclarationStatement");
  const branch = result.prelude[2];
  assert.equal(branch.kind, "IfStatement");
  assert.deepEqual(branch.thenBody.statements[0], effect("selected"));
  assert.deepEqual(branch.elseBody.statements[0], effect("otherwise"));
  assert.deepEqual(result.completion.expression, identifier("captured"));
});

test("pure branches preserve native conditional syntax without a temporary", () => {
  const result = selectCsharpPlannedBranch(csharpPlannedValue(boolean, identifier("enabled")),
    csharpPlannedValue(integer, identifier("selected")), csharpPlannedValue(integer, identifier("otherwise")), integer, undefined);
  assert.equal(result.completion.expression.kind, "ConditionalExpression");
  assert.deepEqual(result.prelude, []);
});

test("void, never and unavailable values retain their distinct native planning outcomes", () => {
  assert.equal(csharpPlannedEffect(integer, []), undefined);
  const omitted = csharpPlannedEffect(csharpVoidTargetType(), [effect("voidCall")]);
  assert.equal(mapCsharpPlannedValue(omitted, integer, () => assert.fail("void is not a value")), undefined);
  assert.equal(mapCsharpPlannedValue(undefined, integer, () => assert.fail("missing is not a value")), undefined);
  assert.equal(selectCsharpPlannedBranch(csharpPlannedValue(boolean, identifier("enabled")), omitted, omitted,
    csharpVoidTargetType(), undefined).completion.kind, "void");
});
