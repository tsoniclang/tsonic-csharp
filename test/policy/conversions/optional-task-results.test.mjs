import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { getCsharpAwaitResultTargetType } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { csharpAbsenceTargetType, csharpDelegateTargetType, csharpNullableTargetType,
  csharpTaskTargetType, csharpVoidTargetType, csharpSourcePrimitiveTargetType,
  combineCsharpTargetUnionMembers, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("optional Task lifting preserves arity, payload and non-null requirements", () => {
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, target: {} };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const unit = csharpVoidTargetType();
  const task = csharpTaskTargetType(unit);
  const optional = csharpNullableTargetType(task);
  assert.ok(targetTypeRefEquals(combineCsharpTargetUnionMembers([task, unit]), optional));
  assert.ok(targetTypeRefEquals(combineCsharpTargetUnionMembers([unit]), unit));
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
  assert.ok(targetTypeRefEquals(getCsharpAwaitResultTargetType(optional), unit));
  assert.ok(targetTypeRefEquals(getCsharpAwaitResultTargetType(csharpNullableTargetType(csharpTaskTargetType(integer))), csharpNullableTargetType(integer)));
});
