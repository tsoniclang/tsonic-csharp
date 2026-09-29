import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpTaskTargetType, csharpVoidTargetType, csharpSourcePrimitiveTargetType,
  getCsharpAwaitResultTargetType, combineCsharpTargetUnionMembers, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("optional Task lifting preserves arity, payload and non-null requirements", () => {
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() {} }, target: {} };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const unit = csharpVoidTargetType();
  const task = csharpTaskTargetType(unit);
  const optional = csharpNullableTargetType(task);
  assert.ok(targetTypeRefEquals(combineCsharpTargetUnionMembers([task, unit]), optional));
  assert.ok(targetTypeRefEquals(combineCsharpTargetUnionMembers([unit]), unit));
  assert.equal(selectCsharpConversion(policy, task, optional, "implicit").kind, "identity");
  assert.equal(selectCsharpConversion(policy, csharpAbsenceTargetType(), optional, "implicit").kind, "implicit");
  assert.equal(selectCsharpConversion(policy, csharpTaskTargetType(integer), optional, "implicit").kind, "implicit");
  for (const [source, target] of [[optional, task],
    [task, csharpTaskTargetType(integer)], [csharpTaskTargetType(integer), csharpTaskTargetType(boolean)],
    [integer, optional], [unit, optional]]) {
    assert.equal(selectCsharpConversion(policy, source, target, "implicit").kind, "rejected");
  }
  const adapter = selectCsharpConversion(policy, csharpDelegateTargetType("System.Action", []), csharpDelegateTargetType("System.Func", [], optional), "implicit");
  assert.equal(adapter.kind, "delegate-adapter");
  assert.deepEqual(adapter.returnConversion, { kind: "void-return" });
  assert.ok(targetTypeRefEquals(getCsharpAwaitResultTargetType(optional), unit));
  assert.ok(targetTypeRefEquals(getCsharpAwaitResultTargetType(csharpNullableTargetType(csharpTaskTargetType(integer))), csharpNullableTargetType(integer)));
});
