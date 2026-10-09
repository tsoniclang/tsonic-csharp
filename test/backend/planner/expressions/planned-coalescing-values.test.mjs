import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpCoalescingValue } from "../../../../dist/backend/planner/expressions/planned-value-composition.js";
import { csharpPlannedValue, csharpPlannedEffect } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { csharpSourcePrimitiveTargetType, csharpNeverTargetType, csharpVoidTargetType,
  csharpTargetNamedType, csharpNullableTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpOptionalStorageProjection } from "../../../../dist/target-model/types/projections.js";

const integer = csharpSourcePrimitiveTargetType("uint64");
const identifier = name => ({ kind: "IdentifierName", name });
const call = name => ({ kind: "InvocationExpression", callee: identifier(name), arguments: [] });
const effect = name => ({ kind: "ExpressionStatement", expression: call(name) });
const node = {};

function context(select = () => assert.fail("identity needs no conversion")) {
  let count = 0;
  return { scope: {}, names: { temporaryName: name => `${name}_${count++}` }, program: {
    source: { ast: { pos: () => 1, end: () => 2, getSourceFile: () => undefined } }, conversions: { select },
  } };
}

test("coalescing with exact native absence preserves one unchanged nullable input", () => {
  const carrier = csharpNullableTargetType(integer);
  const left = csharpPlannedValue(carrier, call("left"), [effect("before")]);
  const input = context();
  input.names.temporaryName = () => assert.fail("native nullable identity requires no temporary");
  for (const expression of [{ kind: "LiteralExpression", value: null }, {
    kind: "DefaultExpression", type: { kind: "NullableType", inner: { kind: "PredefinedType", name: "ulong" } },
  }]) {
    const right = csharpPlannedValue(carrier, expression);
    assert.equal(planCsharpCoalescingValue(node, node, input, [], left, right, carrier) === left, true,
      "retain the exact original input, prelude, native width and evaluation without branching or copying");
  }
  const different = csharpNullableTargetType(csharpSourcePrimitiveTargetType("uint32"));
  const changed = csharpPlannedValue(different, { kind: "LiteralExpression", value: null });
  const selected = planCsharpCoalescingValue(node, node, input, [], left, changed, carrier);
  assert.equal(selected === left, false, "a different selected carrier is not silently discarded");
  assert.equal(selected.completion.expression.kind, "BinaryExpression");
});

test("expression-only coalescing remains one lazy native operator without temporary storage", () => {
  const input = context();
  input.names.temporaryName = () => assert.fail("a native coalescing expression needs no capture");
  const left = csharpPlannedValue(csharpNullableTargetType(integer), call("left"), [effect("before")]);
  const right = csharpPlannedValue(integer, call("right"));
  const planned = planCsharpCoalescingValue(node, node, input, [], left, right, integer);
  assert.deepEqual(planned.prelude, [effect("before")]);
  assert.deepEqual(planned.completion.expression, { kind: "BinaryExpression", left: call("left"),
    operatorToken: { kind: "QuestionQuestionToken" }, right: call("right") });
});

test("statement-bearing fallback stays inside the absent branch after one left observation", () => {
  const planned = planCsharpCoalescingValue(node, node, context(), [],
    csharpPlannedValue(csharpNullableTargetType(integer), call("left"), [effect("before")]),
    csharpPlannedValue(integer, identifier("completed"), [effect("pending"), effect("complete")]), integer);
  assert.deepEqual(planned.prelude.map(statement => statement.kind),
    ["ExpressionStatement", "LocalDeclarationStatement", "IfStatement"]);
  assert.deepEqual(planned.prelude[0], effect("before"));
  const branch = planned.prelude[2];
  assert.deepEqual(branch.condition.expression, call("left"));
  assert.equal(branch.condition.type.name, "ulong");
  assert.equal(branch.thenBody.statements.length, 1);
  assert.equal(branch.thenBody.statements[0].expression.right.name, branch.condition.designation);
  assert.deepEqual(branch.elseBody.statements.slice(0, 2), [effect("pending"), effect("complete")]);
  assert.deepEqual(branch.elseBody.statements[2].expression.right, identifier("completed"));
  assert.equal(planned.completion.expression.name, planned.prelude[1].name);
});

test("coalescing reuses sealed present-to-optional conversion without manufacturing an absence", () => {
  const optional = csharpNullableTargetType(integer);
  let selections = 0;
  const input = context((source, target, mode) => {
    selections++;
    assert.equal(source === integer, true, "exact present carrier");
    assert.equal(target === optional, true, "exact optional result carrier");
    assert.equal(mode, "implicit");
    return { kind: "identity" };
  });
  const planned = planCsharpCoalescingValue(node, node, input, [],
    csharpPlannedValue(optional, call("left")),
    csharpPlannedValue(optional, identifier("completed"), [effect("pending")]), optional);
  assert.equal(selections, 1);
  assert.equal(planned.completion.carrier === optional, true, "original result storage");
  assert.equal(planned.prelude[0].type.kind, "NullableType");
  const branch = planned.prelude[1];
  assert.equal(branch.thenBody.statements[0].expression.right.name, branch.condition.designation);
  assert.deepEqual(branch.elseBody.statements[0], effect("pending"));
});

test("native reference, generic optional and closed broad guards keep their canonical physical storage", () => {
  const reference = csharpTargetNamedType("fixture:Record", [], { kind: "named", name: "Record" });
  const parameter = { kind: "type-parameter", identity: "Source::Value", name: "Value" };
  const broad = csharpTsValueTargetType();
  for (const [storage, present, guardKind] of [
    [csharpNullableTargetType(reference), reference, "IsPatternExpression"],
    [csharpOptionalStorageProjection(parameter), parameter, "BinaryExpression"],
    [broad, broad, "BinaryExpression"],
  ]) {
    const planned = planCsharpCoalescingValue(node, node, context(), [],
      csharpPlannedValue(storage, call("left")),
      csharpPlannedValue(present, identifier("completed"), [effect("pending")]), present);
    assert.equal(planned === undefined, false, guardKind);
    const branch = planned.prelude[1];
    assert.equal(branch.condition.kind, guardKind);
    assert.deepEqual(branch.elseBody.statements[0], effect("pending"));
    if (present === parameter) assert.equal(branch.thenBody.statements[0].expression.right.callee.name, "As2");
    if (present === broad) assert.equal(branch.condition.right.operand.callee.name, "isUndefined");
    if (present === reference) assert.equal(branch.condition.type.name, "Record");
  }
});

test("expression-only generic optional and broad values retain their own lazy storage operations", () => {
  const parameter = { kind: "type-parameter", identity: "Source::Value", name: "Value" };
  const broad = csharpTsValueTargetType();
  for (const [storage, present] of [[csharpOptionalStorageProjection(parameter), parameter], [broad, broad]]) {
    const planned = planCsharpCoalescingValue(node, node, context(), [],
      csharpPlannedValue(storage, call("left")), csharpPlannedValue(present, call("right")), present);
    assert.equal(planned === undefined, false, "exact physical optional relation");
    assert.deepEqual(planned.prelude, []);
    const branch = planned.completion.expression;
    assert.equal(branch.kind, "ConditionalExpression");
    assert.deepEqual(branch.whenFalse, call("right"));
    assert.deepEqual(branch.condition.left.expression, call("left"));
    if (present === parameter) assert.equal(branch.whenTrue.callee.name, "As2");
    if (present === broad) assert.equal(branch.condition.right.operand.callee.name, "isUndefined");
  }
});

test("a nonreturning fallback stays absent-only and a nonreturning left has no branch", () => {
  const stopped = csharpPlannedEffect(csharpNeverTargetType(), [effect("beforeFailure"),
    { kind: "ThrowStatement", expression: identifier("original") }]);
  const planned = planCsharpCoalescingValue(node, node, context(), [],
    csharpPlannedValue(csharpNullableTargetType(integer), call("left")), stopped, integer);
  const branch = planned.prelude[1];
  assert.deepEqual(branch.elseBody.statements, stopped.prelude);
  assert.equal(branch.thenBody.statements.length, 1);
  assert.equal(planCsharpCoalescingValue(node, node, context(), [], stopped,
    csharpPlannedValue(integer, call("forbidden"), [effect("forbidden")]), integer) === stopped, true,
  "original nonreturning completion identity");
});

test("coalescing cannot invent a value from void or an unavailable selected conversion", () => {
  const omitted = csharpPlannedEffect(csharpVoidTargetType(), [effect("voidCall")]);
  const left = csharpPlannedValue(csharpNullableTargetType(integer), call("left"));
  assert.equal(planCsharpCoalescingValue(node, node, context(), [], omitted,
    csharpPlannedValue(integer, call("right")), integer) === undefined, true, "void has no left storage");
  assert.equal(planCsharpCoalescingValue(node, node, context(), [], left, omitted, integer) === undefined, true,
    "void fallback needs an independently admitted absence conversion");
  const diagnostics = [];
  const optional = csharpNullableTargetType(integer);
  assert.equal(planCsharpCoalescingValue(node, node, context(() => undefined), diagnostics, left,
    csharpPlannedValue(optional, identifier("completed"), [effect("pending")]), optional) === undefined, true,
  "missing present conversion rejects without relabeling");
  assert.equal(diagnostics.length, 1);
});
