import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpPlannedEffect,
  csharpPlannedValue,
  mapCsharpPlannedValue,
  planCsharpPlannedBranch,
  sequenceCsharpPlannedValues,
} from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpVoidTargetType, csharpNeverTargetType } from "../../../../dist/target-model/types/scalar-types.js";
import { planCsharpDiscardedOperand } from "../../../../dist/backend/planner/statements/statement-output.js";

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
  const result = planCsharpPlannedBranch(csharpPlannedValue(boolean, identifier("enabled"), [effect("condition")]),
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
  const result = planCsharpPlannedBranch(csharpPlannedValue(boolean, identifier("enabled")),
    csharpPlannedValue(integer, identifier("selected")), csharpPlannedValue(integer, identifier("otherwise")), integer, undefined);
  assert.equal(result.completion.expression.kind, "ConditionalExpression");
  assert.deepEqual(result.prelude, []);
});

test("void, never and unavailable values retain their distinct native planning outcomes", () => {
  assert.equal(csharpPlannedEffect(integer, []), undefined);
  const omitted = csharpPlannedEffect(csharpVoidTargetType(), [effect("voidCall")]);
  assert.equal(mapCsharpPlannedValue(omitted, integer, () => assert.fail("void is not a value")), undefined);
  assert.equal(mapCsharpPlannedValue(undefined, integer, () => assert.fail("missing is not a value")), undefined);
  assert.equal(planCsharpPlannedBranch(csharpPlannedValue(boolean, identifier("enabled")), omitted, omitted,
    csharpVoidTargetType(), undefined).completion.kind, "void");
});

test("an explicitly discarded native operand preserves earlier evaluation without a phantom value", () => {
  const keyCall = { kind: "InvocationExpression", callee: identifier("key"), arguments: [] };
  const result = sequenceCsharpPlannedValues([
    csharpPlannedValue(integer, identifier("receiver")), planCsharpDiscardedOperand(csharpPlannedValue(integer, keyCall)),
  ], capture, expressions => {
    assert.equal(expressions.length, 1);
    return csharpPlannedValue(integer, expressions[0]);
  });
  assert.equal(result.prelude.length, 2);
  assert.deepEqual(result.prelude[0].initializer, identifier("receiver"));
  assert.deepEqual(result.prelude[1].expression, keyCall);
  assert.deepEqual(result.completion.expression, identifier("captured"));
});

test("discarded pure literals add neither a temporary nor a native statement", () => {
  const result = sequenceCsharpPlannedValues([
    csharpPlannedValue(integer, identifier("receiver")),
    planCsharpDiscardedOperand(csharpPlannedValue(integer, { kind: "LiteralExpression", value: 7 })),
  ], () => assert.fail("a discarded literal has no effects"), expressions => csharpPlannedValue(integer, expressions[0]));
  assert.deepEqual(result.prelude, []);
  assert.deepEqual(result.completion.expression, identifier("receiver"));
});

test("native location captures retain their acquisition statements before discarded key effects", () => {
  const result = sequenceCsharpPlannedValues([
    csharpPlannedValue(integer, identifier("receiver")),
    planCsharpDiscardedOperand(csharpPlannedEffect(csharpVoidTargetType(), [effect("key")])),
  ], () => ({ kind: "native-location", expression: identifier("address"), prelude: [effect("acquire")] }),
  expressions => csharpPlannedValue(integer, expressions[0]));
  assert.deepEqual(result.prelude, [effect("acquire"), effect("key")]);
  assert.deepEqual(result.completion.expression, identifier("address"));
});

test("discarded void and terminating operands use the same bounded ordered sequencer", () => {
  const omitted = planCsharpDiscardedOperand(csharpPlannedEffect(csharpVoidTargetType(), [effect("discarded")]));
  const stopped = planCsharpDiscardedOperand(csharpPlannedEffect(csharpNeverTargetType(), [effect("stopped")]));
  const result = sequenceCsharpPlannedValues([csharpPlannedValue(integer, identifier("receiver")), omitted, stopped,
    csharpPlannedValue(integer, identifier("forbidden"), [effect("forbidden")])], capture,
  () => assert.fail("a terminated sequence cannot produce a value"));
  assert.equal(result.completion.kind, "never");
  assert.equal(result.prelude.length, 3);
  assert.deepEqual(result.prelude[1], effect("discarded"));
  assert.deepEqual(result.prelude[2], effect("stopped"));
  assert.equal(sequenceCsharpPlannedValues([{ kind: "effect", effect: csharpPlannedValue(integer, identifier("invalid")) }],
    capture, () => assert.fail("a value cannot masquerade as an effect")), undefined);
  assert.equal(sequenceCsharpPlannedValues([csharpPlannedEffect(csharpVoidTargetType(), [])], capture,
    () => assert.fail("an ordinary void operand cannot masquerade as a value")), undefined);
});
