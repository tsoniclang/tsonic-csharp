import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpContextualAsyncReturn } from "../../../dist/policy/conversions/contextual-async-return.js";
import { csharpBigIntegerTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTaskTargetType, csharpVoidTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
const integer = csharpSourcePrimitiveTargetType("int32");
const text = csharpStringTargetType();
const absentInteger = csharpNullableTargetType(integer);

test("contextual async bodies select one exact Task result before emission", () => {
  const task = csharpTaskTargetType(absentInteger);
  const contextual = csharpNullableTargetType(csharpRuntimeUnionTargetType([task, integer]));
  for (const inferred of [csharpTaskTargetType(csharpVoidTargetType()), csharpTaskTargetType(integer), task]) {
    assert.equal(targetTypeRefEquals(selectCsharpContextualAsyncReturn(policy, inferred, contextual, "inferred"), task), true);
  }
  assert.equal(selectCsharpContextualAsyncReturn(policy, csharpTaskTargetType(text), contextual, "inferred") === undefined, true);
});

test("contextual async selection cannot invent absence, unwrap Tasks or choose ambiguous alternatives", () => {
  const unit = csharpTaskTargetType(csharpVoidTargetType());
  const task = csharpTaskTargetType(integer);
  for (const [source, target] of [[unit, task], [integer, task], [task, integer], [task, undefined],
    [task, csharpRuntimeUnionTargetType([task, csharpTaskTargetType(absentInteger)])]]) {
    assert.equal(selectCsharpContextualAsyncReturn(policy, source, target, "inferred") === undefined, true);
  }
});

test("inferred async context cannot widen the body's exact native payload", () => {
  const wide = csharpSourcePrimitiveTargetType("int64");
  const floating = csharpSourcePrimitiveTargetType("float64");
  for (const [source, target] of [[integer, wide], [integer, floating], [wide, csharpBigIntegerTargetType()]]) {
    assert.equal(selectCsharpContextualAsyncReturn(policy, csharpTaskTargetType(source), csharpTaskTargetType(target), "inferred") === undefined,
      true, "an inferred generic result does not replace the body's native payload with an implicitly convertible one");
    assert.equal(selectCsharpContextualAsyncReturn(policy, csharpTaskTargetType(source), csharpTaskTargetType(csharpNullableTargetType(target)), "inferred") === undefined,
      true, "adding absence cannot disguise a different native payload");
  }
});

test("authored async result contracts retain supported native widening", () => {
  const wide = csharpSourcePrimitiveTargetType("int64");
  for (const [source, target] of [[integer, wide], [integer, csharpSourcePrimitiveTargetType("float64")], [wide, csharpBigIntegerTargetType()]]) {
    const task = csharpTaskTargetType(target);
    assert.equal(targetTypeRefEquals(selectCsharpContextualAsyncReturn(policy, csharpTaskTargetType(source), task, "authored"), task),
      true, "a checked authored native result contract admits its declared conversion");
  }
});

test("inferred native async identity and absence completion preserve the same payload", () => {
  const wide = csharpSourcePrimitiveTargetType("int64");
  const task = csharpTaskTargetType(wide);
  const nullableTask = csharpTaskTargetType(csharpNullableTargetType(wide));
  assert.equal(targetTypeRefEquals(selectCsharpContextualAsyncReturn(policy, task, task, "inferred"), task), true,
    "exact native identity remains admitted");
  assert.equal(targetTypeRefEquals(selectCsharpContextualAsyncReturn(policy, task, nullableTask, "inferred"), nullableTask), true,
    "one native absence state completes the same native payload");
  assert.equal(selectCsharpContextualAsyncReturn(policy, nullableTask, task, "inferred") === undefined, true,
    "an inferred context cannot erase an admitted absence");
});

test("missing contextual authority cannot become an authored conversion", () => {
  const task = csharpTaskTargetType(integer);
  assert.equal(selectCsharpContextualAsyncReturn(policy, task, task, undefined) === undefined, true,
    "missing checked provenance does not silently authorize a contextual override");
});
