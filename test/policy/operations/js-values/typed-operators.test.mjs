import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpJsValueBinaryOperation, selectCsharpJsValueUnaryOperation } from "../../../../dist/analysis/operations/js-values.js";
import { validateCsharpJsValueOperationSelection } from "../../../../dist/policy/operations/js-values/selection.js";
import { csharpTsValueTargetType } from "../../../../dist/policy/types/index.js";

const carrier = csharpTsValueTargetType();
const policy = { types: { resolveNode: () => carrier, resolveReadStorage: () => undefined } };

test("checked binary operator facts select one typed entry, not runtime string dispatch", () => {
  for (const [operator, member, result] of [
    ["+", "Add", "value"], ["-", "Subtract", "value"], ["*", "Multiply", "value"],
    ["/", "Divide", "value"], ["%", "Remainder", "value"],
    ["==", "Equal", "bool"], ["!=", "NotEqual", "bool"], ["===", "StrictEqual", "bool"], ["!==", "StrictNotEqual", "bool"],
    ["<", "LessThan", "bool"], ["<=", "LessThanOrEqual", "bool"], [">", "GreaterThan", "bool"], [">=", "GreaterThanOrEqual", "bool"],
  ]) {
    const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(policy, {}, {}, {}, operator));
    assert.equal(selected.kind, "resolved", operator);
    assert.equal(selected.runtimeMember, member, operator);
    assert.equal(selected.dispatch, "static", operator);
    assert.equal(selected.shortCircuit === undefined, true, operator);
    if (result === "bool") assert.deepEqual(selected.resultType, { kind: "source-primitive", name: "bool" });
    else assert.deepEqual(selected.resultType, carrier);
  }
});

test("checked unary operators select their exact typed entries and reject unsupported operations", () => {
  for (const [operator, member] of [["+", "Positive"], ["-", "Negate"], ["~", "BitwiseNot"], ["!", "LogicalNot"]]) {
    const selected = selectCsharpJsValueUnaryOperation(policy, {}, {}, operator);
    assert.equal(selected.kind, "resolved", operator);
    assert.equal(selected.runtimeMember, member, operator);
  }
  for (const operator of ["<<", ">>", ">>>", "&", "|", "^", "**", "in", "instanceof"]) {
    const selected = selectCsharpJsValueBinaryOperation(policy, {}, {}, {}, operator);
    assert.equal(selected.kind, "rejected", operator);
    assert.equal(selected.reason.includes(operator), true, operator);
  }
  for (const operator of ["delete", "++", "--"]) assert.equal(selectCsharpJsValueUnaryOperation(policy, {}, {}, operator).kind, "rejected", operator);
});

test("logical typed entries retain the selected native conditional, never eager right evaluation", () => {
  for (const [operator, member, condition, whenTrue] of [
    ["&&", "And", "ToDynamicBoolean", "right"], ["||", "Or", "ToDynamicBoolean", "left"], ["??", "Coalesce", "isUndefined", "right"],
  ]) {
    const selected = validateCsharpJsValueOperationSelection(selectCsharpJsValueBinaryOperation(policy, {}, {}, {}, operator));
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.runtimeMember, member);
    assert.equal(selected.shortCircuit.condition.runtimeMember, condition);
    assert.equal(selected.shortCircuit.whenTrue, whenTrue);
    assert.equal(Object.isFrozen(selected.shortCircuit), true);
  }
});
