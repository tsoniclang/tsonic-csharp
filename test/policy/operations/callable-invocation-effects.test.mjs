import assert from "node:assert/strict";
import test from "node:test";
import { jsCallPolicy, jsMemberIdentity } from "../../../dist/policy/operations/source-profiles/js/common.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const callable = csharpDelegateTargetType("System.Func", [integer], integer);

function fixture(overrides = {}) {
  const parameters = [integer, callable].map((type, index) => Object.freeze({
    name: `value${index}`, type, passingMode: "by-value",
  }));
  const member = { id: "owned:map", kind: "method", parameters, returnType: integer };
  const source = { sourceSelectedSignatureKind: "resolved",
    sourceSelectedSignatureParameters: parameters.map(() => ({ acceptsOmission: false })),
    sourceArguments: parameters.map(() => ({ expression: {} })),
    sourceArgumentBindings: parameters.map((_parameter, index) => ({
      sourceArgumentIndex: index, sourceParameterIndex: index,
      effectiveArgumentIndex: index, sourceForm: "value",
    })),
  };
  const identity = { owner: "js", kind: "member", declaringName: "ArrayConstructor", name: "from", ...overrides };
  const policy = jsCallPolicy(jsMemberIdentity(identity.declaringName, identity.name), () => member, { kind: "none" });
  const host = { ast: { is: { IsSpreadElement: () => false } } };
  return { parameters, member, source, identity, select: () => policy.select({ source, identity, host }) };
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
  input.source.sourceSelectedSignatureParameters = [{ acceptsOmission: false }];
  input.source.sourceArguments = [{ expression: {} }];
  input.source.sourceArgumentBindings = [{ sourceArgumentIndex: 0, sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" }];
  input.source.sourceReceiver = { expression: {} };
  const policy = jsCallPolicy(jsMemberIdentity("Array", "find"), () => input.member,
    { kind: "target-parameter", targetParameterIndex: 0 });
  const selected = policy.select({ source: input.source, identity: input.identity });
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.invocationOnlyCallableArgumentIndexes[0], 0, "source argument zero, not target parameter one");
  assert.equal(selected.call.arguments[0].targetParameterIndex, 1);
  const reordered = fixture();
  reordered.parameters.reverse();
  const reorderPolicy = jsCallPolicy(jsMemberIdentity("ArrayConstructor", "from"), () => reordered.member,
    { kind: "none" }, { targetParameterBySourceParameter: [1, 0] });
  const reorderSelected = reorderPolicy.select({ source: reordered.source, identity: reordered.identity });
  assert.equal(reorderSelected.kind, "resolved");
  assert.equal(reorderSelected.call.invocationOnlyCallableArgumentIndexes[0], 1, "effect follows source slot through explicit mapping");
  assert.equal(reorderSelected.call.arguments[1].targetParameterIndex, 0);
});

test("omitted optional callbacks and callback-free selected overloads do not reject valid calls", () => {
  const input = fixture({ declaringName: "Array", name: "sort" });
  input.member.parameters = [{ ...input.parameters[1], optional: true }];
  input.source.sourceSelectedSignatureParameters = [{ acceptsOmission: true }];
  input.source.sourceArguments = [];
  input.source.sourceArgumentBindings = [];
  assert.equal(input.select().kind, "resolved", "default sort has no comparator argument");
  assert.equal(input.select().call.invocationOnlyCallableArgumentIndexes.length, 0);
  const withoutMapper = fixture();
  withoutMapper.member.parameters = [withoutMapper.parameters[0]];
  withoutMapper.source.sourceSelectedSignatureParameters.pop();
  withoutMapper.source.sourceArguments.pop();
  withoutMapper.source.sourceArgumentBindings.pop();
  assert.equal(withoutMapper.select().kind, "resolved", "Array.from selected one-argument overload");
  assert.equal(withoutMapper.select().call.invocationOnlyCallableArgumentIndexes.length, 0);
});

test("callable effects reject non-callable, byref, unbound and inconsistent selections", () => {
  for (const mutate of [
    input => input.parameters[1] = input.parameters[0],
    input => input.parameters[1] = { ...input.parameters[1], passingMode: "by-reference" },
    input => input.parameters[1] = { ...input.parameters[1], paramsArray: true },
    input => input.source.sourceArgumentBindings.pop(),
    input => input.source.sourceArgumentBindings[1].sourceArgumentIndex = -1,
    input => input.source.sourceArgumentBindings[1].sourceArgumentIndex = 0.5,
    input => input.source.sourceArgumentBindings[1].sourceArgumentIndex = 2,
    input => delete input.source.sourceArguments[1],
    input => input.source.sourceSelectedSignatureKind = "unresolved",
    input => input.source.sourceArgumentBindings.push({ ...input.source.sourceArgumentBindings[1] }),
    input => input.source.sourceArgumentBindings[1].sourceParameterIndex = -1,
    input => input.source.sourceArgumentBindings[1].sourceParameterIndex = 0.5,
    input => input.source.sourceArgumentBindings[1].sourceParameterIndex = 2,
  ]) {
    const input = fixture();
    mutate(input);
    assert.equal(input.select().kind, "rejected", "exact valid binding and callable contract required");
  }
});

test("spread-element mappings do not claim whole source arguments invocation-only", () => {
  const input = fixture();
  input.source.sourceArgumentBindings[1].sourceForm = "spread-element";
  const selected = input.select();
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.call.invocationOnlyCallableArgumentIndexes.length, 0);
});
