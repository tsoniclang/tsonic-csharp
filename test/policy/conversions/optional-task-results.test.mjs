import assert from "node:assert/strict";
import test from "node:test";
import { createPublishedSourceUnionFixture } from "../../helpers/published-source-unions.mjs";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpTaskTargetType, csharpVoidTargetType, csharpSourcePrimitiveTargetType,
  targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("optional Task lifting preserves arity, payload and non-null requirements", () => {
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, target: {} };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const unit = csharpVoidTargetType();
  const task = csharpTaskTargetType(unit);
  const fixture = createPublishedSourceUnionFixture("declare function optionalResult(value: Promise<void> | void): void;");
  const optional = fixture.carrier("optionalResult");
  assert.equal(fixture.descriptor("optionalResult").kind, "optional", "the actual Promise<void> | void has one Source absence");
  assert.ok(targetTypeRefEquals(optional, csharpNullableTargetType(task)));
  assert.deepEqual(selectCsharpConversion(policy, task, optional, "implicit"), { kind: "implicit", proof: "nullable" });
  assert.deepEqual(selectCsharpConversion(policy, csharpAbsenceTargetType(), optional, "implicit"), { kind: "absence" });
  assert.equal(selectCsharpConversion(policy, csharpTaskTargetType(integer), optional, "implicit").kind, "implicit");
  for (const [source, target] of [[optional, task],
    [task, csharpTaskTargetType(integer)], [csharpTaskTargetType(integer), csharpTaskTargetType(boolean)],
    [integer, optional], [unit, optional]]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "rejected");
  }
  const adapter = selectCsharpConversion(policy, csharpDelegateTargetType("System.Action", []), csharpDelegateTargetType("System.Func", [], optional), "implicit");
  assert.equal(adapter.kind, "delegate-adapter");
  assert.deepEqual(adapter.returnConversion, { kind: "void-return" });
  assert.ok(targetTypeRefEquals(selectCsharpAwaitCompletion(optional, undefined, "consumed", undefined)?.result, unit));
  assert.ok(targetTypeRefEquals(selectCsharpAwaitCompletion(csharpNullableTargetType(csharpTaskTargetType(integer)),
    undefined, "consumed", undefined)?.result, csharpNullableTargetType(integer)));
});
