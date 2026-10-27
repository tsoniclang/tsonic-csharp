import assert from "node:assert/strict";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
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
  providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }), target: {},
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
  assert.equal(completion.alternatives[0].resultMapping.arms.length, 2);
  assert.equal(completion.alternatives[1].resultMapping.arms.length, 2);
  assert.ok(Object.isFrozen(completion));
  assert.ok(Object.isFrozen(completion.alternatives));
});

test("native Task completion preserves the exact physical result rather than renormalizing its generic ABI", () => {
  const repeated = csharpRuntimeUnionTargetType([integer, integer]);
  const reordered = csharpRuntimeUnionTargetType([string, integer]);
  const nested = csharpRuntimeUnionTargetType([string, repeated]);
  for (const [label, result] of [
    ["duplicate generic slots", repeated],
    ["native generic order", reordered],
    ["nested native union", nested],
    ["native array result", { kind: "array", element: nested }],
    ["native optional result", csharpNullableTargetType(nested)],
    ["native nested Task result", csharpTaskTargetType(nested)],
  ]) {
    const completion = selectCsharpAwaitCompletion(csharpTaskTargetType(result));
    assert.equal(completion !== undefined, true, `${label}: a closed native Task is admitted`);
    assert.equal(completion.result === result, true, `${label}: the actual native TResult is unchanged`);
    assert.equal(completion.form, "direct", `${label}: one native await, not a result remapping`);
    assert.equal(completion.alternatives.length, 1, `${label}: no invented completion alternatives`);
    assert.equal(completion.alternatives[0].resultMapping, undefined, `${label}: no union reconstruction`);
    assert.equal(completion.alternatives[0].resultPath.length, 0, `${label}: no new native union injection`);
  }
});

test("identity await and equal native Task alternatives retain their actual carrier layout", () => {
  const result = csharpRuntimeUnionTargetType([string, integer, integer]);
  const identity = selectCsharpAwaitCompletion(result);
  assert.equal(identity?.form, "identity", "a native non-Task result remains a synchronous value");
  assert.equal(identity?.result === result, true, "identity await does not reorder or collapse native union slots");
  const task = csharpTaskTargetType(result);
  const completion = selectCsharpAwaitCompletion(csharpRuntimeUnionTargetType([task, task]));
  assert.equal(completion?.result === result, true, "the same actual TResult requires no heterogeneous join");
  assert.equal(completion?.alternatives.every(alternative => alternative.resultMapping === undefined && alternative.resultPath.length === 0), true,
    "equal native Task alternatives retain their existing result without reconstructing its payload");
  const optional = selectCsharpAwaitCompletion(csharpNullableTargetType(task));
  assert.equal(optional !== undefined && targetTypeRefEquals(optional.result, csharpNullableTargetType(result)), true,
    "a genuinely optional receiver adds only the native nullable result wrapper");
  assert.equal(optional?.alternatives[0].result === result && optional.alternatives[0].resultMapping === undefined, true,
    "receiver absence does not normalize the existing native TResult payload");
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
