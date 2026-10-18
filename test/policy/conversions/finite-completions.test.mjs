import assert from "node:assert/strict";
import test from "node:test";
import {
  csharpAbsenceTargetType, csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTaskTargetType,
  csharpVoidTargetType, targetTypeRefEquals, csharpTsValueTargetType,
} from "../../../dist/target-model/types/index.js";
import { selectCsharpAwaitCompletion } from "../../../dist/policy/operations/control-flow/await-completions.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/index.js";
import { selectCsharpRuntimeUnionProjection } from "../../../dist/policy/conversions/carriers.js";

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

test("an exact generic scalar enters its unique nested result arm without flattening the Task ABI", () => {
  const part = Object.freeze({ kind: "type-parameter", identity: "resolve:Part", name: "Part" });
  const foreign = Object.freeze({ ...part, identity: "foreign:Part" });
  const number = csharpSourcePrimitiveTargetType("float64");
  const result = csharpRuntimeUnionTargetType([number, part]);
  const task = csharpTaskTargetType(result);
  const input = csharpRuntimeUnionTargetType([result, task]);
  for (const [carrier, index] of [[part, 1], [number, 0]]) {
    const selected = selectCsharpConversion(policy, carrier, input, "implicit");
    assert.equal(selected.kind === "implicit" && selected.proof === "runtime-union-arm" &&
      selected.armIndex === 0 && selected.armType === result, true,
    "the first injection selects the original outer result arm, not a flattened ABI");
    const nested = selected.sourceToArm;
    assert.equal(nested.kind === "implicit" && nested.proof === "runtime-union-arm" && nested.armIndex === index &&
      nested.armType === carrier && nested.sourceToArm.kind === "identity", true,
    "the second injection retains the exact checked scalar identity and nested arm index");
  }
  const selectedTask = selectCsharpConversion(policy, task, input, "implicit");
  assert.equal(selectedTask.kind === "implicit" && selectedTask.proof === "runtime-union-arm" && selectedTask.armIndex === 1 &&
    selectedTask.armType === task && selectedTask.sourceToArm.kind === "identity", true,
  "a real Task keeps its outer arm and identity, never an implicit await or unwrap");
  for (const [label, carrier, destination] of [
    ["foreign same-spelled binder", foreign, input],
    ["unproved numeric widening", integer, input],
    ["different Task result", csharpTaskTargetType(part), input],
    ["two exact nested paths", part, csharpRuntimeUnionTargetType([result, csharpRuntimeUnionTargetType([part, string])])],
  ]) assert.equal(selectCsharpConversion(policy, carrier, destination, "implicit").kind, "rejected", label);
  assert.equal(targetTypeRefEquals(input.typeArguments[0], result) && targetTypeRefEquals(input.typeArguments[1], task), true,
    "selection does not mutate native generic slot order or Task construction");
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
  assert.equal(completion.alternatives[0].resultMapping.arms.length, 2);
  assert.equal(completion.alternatives[1].resultMapping.arms.length, 2);
  assert.ok(Object.isFrozen(completion));
  assert.ok(Object.isFrozen(completion.alternatives));
});

test("finite await rejects open carriers and recursive union definitions", () => {
  assert.equal(selectCsharpAwaitCompletion(undefined), undefined);
  assert.equal(selectCsharpAwaitCompletion(csharpTsValueTargetType()), undefined);
  assert.equal(selectCsharpAwaitCompletion({ kind: "type-parameter", name: "T", identity: "T" }), undefined);
  const carrier = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Cycle" };
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
