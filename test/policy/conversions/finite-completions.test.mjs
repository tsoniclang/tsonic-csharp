import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTaskTargetType,
  csharpVoidTargetType, targetTypeRefEquals, csharpTsValueTargetType,
} from "../../../dist/target-model/types/index.js";
import { selectCsharpAwaitCompletion } from "../../../dist/target-model/types/await-completions.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { selectCsharpRuntimeUnionProjection } from "../../../dist/policy/conversions/selection/carriers.js";

const policy = {
  projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => undefined }, target: {},
};
const integer = csharpSourcePrimitiveTargetType("int32");
const string = csharpStringTargetType();
const unit = csharpVoidTargetType();

test("finite Task results enter exact union arms without changing Task identity or arity", () => {
  const task = csharpTaskTargetType(integer);
  const union = csharpRuntimeUnionTargetType([task, string]);
  const selected = selectCsharpConversion(policy, task, union, "implicit");
  assert.equal(selected.kind, "implicit");
  assert.equal(selected.proof, "runtime-union-arm");
  assert.deepEqual(selected.sourceToArm, { kind: "identity" });
  assert.equal(selectCsharpConversion(policy, csharpTaskTargetType(string), union, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(policy, csharpTaskTargetType(unit), task, "implicit").kind, "rejected");
  assert.equal(selectCsharpConversion(policy, task, csharpTaskTargetType(unit), "implicit").kind, "implicit");
});

test("finite await preserves synchronous values and nullable Task result absence", () => {
  for (const carrier of [integer, string, csharpAbsenceTargetType()]) {
    assert.ok(targetTypeRefEquals(selectCsharpAwaitCompletion(carrier).result, carrier));
  }
  const optional = csharpNullableTargetType(integer);
  for (const task of [csharpTaskTargetType(optional), csharpNullableTargetType(csharpTaskTargetType(integer))]) {
    assert.ok(targetTypeRefEquals(selectCsharpAwaitCompletion(task).result, optional));
  }
  const union = csharpRuntimeUnionTargetType([integer, csharpTaskTargetType(optional)]);
  const completion = selectCsharpAwaitCompletion(union);
  assert.ok(targetTypeRefEquals(completion.result, optional));
  assert.deepEqual(completion.alternatives.map(alternative => alternative.task), [false, true]);
  assert.deepEqual(completion.alternatives.map(alternative => alternative.sourcePath[0].index), [0, 1]);
});

test("finite await joins multiple closed results and retains exact nested union maps", () => {
  const boolean = csharpSourcePrimitiveTargetType("bool");
  const first = csharpRuntimeUnionTargetType([integer, string]);
  const second = csharpRuntimeUnionTargetType([integer, boolean]);
  const completion = selectCsharpAwaitCompletion(csharpRuntimeUnionTargetType([
    csharpTaskTargetType(first), csharpTaskTargetType(second),
  ]));
  assert.ok(completion);
  assert.equal(completion.alternatives.length, 2);
  assert.equal(completion.alternatives[0].resultMapping.length, 2);
  assert.equal(completion.alternatives[1].resultMapping.length, 2);
  assert.ok(Object.isFrozen(completion));
  assert.ok(Object.isFrozen(completion.alternatives));
});

test("finite await rejects open carriers and recursive union definitions", () => {
  assert.equal(selectCsharpAwaitCompletion(undefined), undefined);
  assert.equal(selectCsharpAwaitCompletion(csharpTsValueTargetType()), undefined);
  assert.equal(selectCsharpAwaitCompletion({ kind: "type-parameter", name: "T", identity: "T" }), undefined);
  const carrier = { kind: "target-named", id: "Cycle" };
  assert.equal(selectCsharpAwaitCompletion(carrier, {
    sourceUnionArms: selected => selected.id === "Cycle" ? [carrier] : undefined,
  }), undefined);
});

test("closed union payloads may widen absence without inventing an absent source", () => {
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const target = csharpNullableTargetType(string);
  const selected = selectCsharpConversion(policy, union, target, "explicit");
  assert.equal(selected.kind, "runtime-union-projection");
  assert.equal(selected.retainsAbsence, false);
  assert.ok(targetTypeRefEquals(selected.armType, string));
  assert.equal(selectCsharpConversion(policy, union, target, "implicit").kind, "rejected");
  const lifted = selectCsharpConversion(policy, csharpNullableTargetType(union), target, "explicit");
  assert.equal(lifted.kind, "nullable-map");
  assert.equal(lifted.conversion.retainsAbsence, false);
  assert.equal(selectCsharpRuntimeUnionProjection(policy, csharpNullableTargetType(union), target).retainsAbsence, true);
});
