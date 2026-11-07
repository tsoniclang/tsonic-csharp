import assert from "node:assert/strict";
import test from "node:test";
import { jsCallPolicy, jsMemberIdentity } from "../../../dist/policy/operations/source-profiles/js/common.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { sealInvocationOnlyCallableArguments } from "../../../dist/policy/operations/source-profiles/js/invocation-arguments.js";

// Source-profile selection seals the invocation-only callable arguments of a selected JS call after the policy selects
// it (analysis/operations/source-profiles/policy-selection.ts); a call that cannot be sealed is rejected.
function sealed(result, context) {
  if (result?.kind !== "resolved") return result;
  const call = sealInvocationOnlyCallableArguments(context, result.call);
  return call === undefined ? { kind: "rejected" } : { kind: "resolved", call };
}

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const descriptor = Object.freeze({ kind: "primitive", primitive: "int32" });
// The JS meaning of the selected member (facts.profile.member, D18): which parameters are callbacks the member
// invokes without storing.
const profileMembers = new Map([
  ["ArrayConstructor.from", { parameters: ["value", "callback"], effects: { invokesCallbacks: true, storesArguments: false } }],
  ["Array.find", { parameters: ["callback"], effects: { invokesCallbacks: true, storesArguments: false } }],
  ["Array.sort", { parameters: ["callback"], effects: { invokesCallbacks: true, storesArguments: false } }],
]);
const host = { ast: { is: { IsSpreadElement: () => false } }, facts: { profile: {
  member: declaration => declaration.kind === "member" ? profileMembers.get(`${declaration.declaringName}.${declaration.name}`) : undefined,
} } };
const callable = csharpDelegateTargetType("System.Func", [integer], integer);

function fixture(overrides = {}) {
  const parameters = [integer, callable].map((type, index) => Object.freeze({
    name: `value${index}`, type, passingMode: "by-value",
  }));
  const member = { id: "owned:map", kind: "method", parameters, returnType: integer };
  const arguments_ = parameters.map(() => ({ expression: {}, type: descriptor }));
  const source = { call: {}, selection: {}, typeArguments: [],
    parameters: parameters.map((_parameter, index) => ({ name: `value${index}`, kind: "required", type: descriptor })),
    arguments: arguments_,
    bindings: parameters.map((_parameter, index) => ({ argument: arguments_[index].expression,
      argumentIndex: index, parameterIndex: index, effectiveIndex: index, mode: "positional", form: "value" })),
  };
  const identity = { owner: "js", kind: "member", declaringName: "ArrayConstructor", name: "from", ...overrides };
  identity.declaration = { kind: identity.kind, declaringName: identity.declaringName, name: identity.name };
  const policy = jsCallPolicy(jsMemberIdentity(identity.declaringName, identity.name), () => member, { kind: "none" });
  return { parameters, member, source, identity, select: () => sealed(policy.select({ source, identity, host }), { source, identity, host }) };
}

test("invocation-only effects seal exact selected callable arguments immutably", () => {
  const input = fixture();
  const selected = input.select();
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.origin, "source-profile");
  assert.equal(selected.call.invocationOnlyCallableArgumentIndexes.length, 1);
  assert.equal(selected.call.invocationOnlyCallableArgumentIndexes[0], 1);
  assert.equal(selected.call.arguments[1].targetParameter === input.parameters[1], true);
  assert.equal(Object.isFrozen(selected.call), true);
  assert.equal(Object.isFrozen(selected.call.invocationOnlyCallableArgumentIndexes), true);
  for (const identity of [{ owner: "csharp" }, { declaringName: "ForeignArray" }, { kind: "construct" }, { name: "of" }]) {
    const conservative = fixture(identity).select();
    assert.equal(conservative.kind, "resolved");
    assert.equal(conservative.call.invocationOnlyCallableArgumentIndexes === undefined, true, "only exact JS-owned member identities");
  }
});

test("catalog source slots map through the exact target receiver offset and reordered target parameters", () => {
  const input = fixture({ declaringName: "Array", name: "find" });
  input.source.parameters = [{ name: "predicate", kind: "required", type: descriptor }];
  input.source.arguments = [{ expression: {}, type: descriptor }];
  input.source.bindings = [{ argument: input.source.arguments[0].expression, argumentIndex: 0, parameterIndex: 0, effectiveIndex: 0,
    mode: "positional", form: "value" }];
  input.source.receiver = { expression: {}, type: descriptor };
  const policy = jsCallPolicy(jsMemberIdentity("Array", "find"), () => input.member,
    { kind: "target-parameter", targetParameterIndex: 0 });
  const selected = sealed(policy.select({ source: input.source, identity: input.identity, host }), { source: input.source, identity: input.identity, host });
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.invocationOnlyCallableArgumentIndexes[0], 0, "source argument zero, not target parameter one");
  assert.equal(selected.call.arguments[0].targetParameterIndex, 1);
  const reordered = fixture();
  reordered.parameters.reverse();
  const reorderPolicy = jsCallPolicy(jsMemberIdentity("ArrayConstructor", "from"), () => reordered.member,
    { kind: "none" }, { targetParameterBySourceParameter: [1, 0] });
  const reorderSelected = sealed(reorderPolicy.select({ source: reordered.source, identity: reordered.identity, host }),
    { source: reordered.source, identity: reordered.identity, host });
  assert.equal(reorderSelected.kind, "resolved");
  assert.equal(reorderSelected.call.invocationOnlyCallableArgumentIndexes[0], 1, "effect follows source slot through explicit mapping");
  assert.equal(reorderSelected.call.arguments[1].targetParameterIndex, 0);
});

test("omitted optional callbacks and callback-free selected overloads do not reject valid calls", () => {
  const input = fixture({ declaringName: "Array", name: "sort" });
  input.member.parameters = [{ ...input.parameters[1], optional: true }];
  input.source.parameters = [{ name: "comparator", kind: "optional", type: descriptor }];
  input.source.arguments = [];
  input.source.bindings = [];
  assert.equal(input.select().kind, "resolved", "default sort has no comparator argument");
  assert.equal(input.select().call.invocationOnlyCallableArgumentIndexes.length, 0);
  const withoutMapper = fixture();
  withoutMapper.member.parameters = [withoutMapper.parameters[0]];
  withoutMapper.source.parameters.pop();
  withoutMapper.source.arguments.pop();
  withoutMapper.source.bindings.pop();
  assert.equal(withoutMapper.select().kind, "resolved", "Array.from selected one-argument overload");
  assert.equal(withoutMapper.select().call.invocationOnlyCallableArgumentIndexes.length, 0);
});

test("callable effects reject non-callable, byref, unbound and inconsistent selections", () => {
  for (const mutate of [
    input => input.parameters[1] = input.parameters[0],
    input => input.parameters[1] = { ...input.parameters[1], passingMode: "by-reference" },
    input => input.parameters[1] = { ...input.parameters[1], paramsArray: true },
    input => input.source.bindings.pop(),
    input => input.source.bindings[1].argumentIndex = -1,
    input => input.source.bindings[1].argumentIndex = 0.5,
    input => input.source.bindings[1].argumentIndex = 2,
    input => delete input.source.arguments[1],
    input => input.source.bindings.push({ ...input.source.bindings[1] }),
    input => input.source.bindings[1].parameterIndex = -1,
    input => input.source.bindings[1].parameterIndex = 0.5,
    input => input.source.bindings[1].parameterIndex = 2,
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(input.select().kind, "rejected", "exact valid binding and callable contract required");
  }
});

test("spread-element mappings do not claim whole source arguments invocation-only", () => {
  const input = fixture();
  input.source.bindings[1].form = "spread-element";
  const selected = input.select();
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.invocationOnlyCallableArgumentIndexes.length, 0);
});
