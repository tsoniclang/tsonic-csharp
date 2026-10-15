import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpContextualAsyncReturn } from "../../../dist/policy/conversions/contextual-async-return.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTaskTargetType, csharpVoidTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
const integer = csharpSourcePrimitiveTargetType("int32");
const text = csharpStringTargetType();
const absentInteger = csharpNullableTargetType(integer);

test("contextual async bodies select one exact Task result before emission", () => {
  const task = csharpTaskTargetType(absentInteger);
  const contextual = csharpNullableTargetType(csharpRuntimeUnionTargetType([task, integer]));
  for (const inferred of [csharpTaskTargetType(csharpVoidTargetType()), csharpTaskTargetType(integer), task]) {
    assert.equal(targetTypeRefEquals(selectCsharpContextualAsyncReturn(policy, inferred, contextual), task), true);
  }
  assert.equal(selectCsharpContextualAsyncReturn(policy, csharpTaskTargetType(text), contextual) === undefined, true);
});

test("contextual async selection cannot invent absence, unwrap Tasks or choose ambiguous alternatives", () => {
  const unit = csharpTaskTargetType(csharpVoidTargetType());
  const task = csharpTaskTargetType(integer);
  for (const [source, target] of [[unit, task], [integer, task], [task, integer], [task, undefined],
    [task, csharpRuntimeUnionTargetType([task, csharpTaskTargetType(absentInteger)])]]) {
    assert.equal(selectCsharpContextualAsyncReturn(policy, source, target) === undefined, true);
  }
});
