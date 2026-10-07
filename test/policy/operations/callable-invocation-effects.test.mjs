import assert from "node:assert/strict";
import test from "node:test";
import { jsCallPolicy, jsMemberIdentity } from "../../../dist/policy/operations/source-profiles/js/common.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const callable = csharpDelegateTargetType("System.Func", [integer], integer);

function fixture(indexes = [1]) {
  const parameters = [integer, callable].map((type, index) => Object.freeze({
    name: `value${index}`, type, passingMode: "by-value",
  }));
  const member = { id: "owned:map", kind: "method", parameters, returnType: integer };
  const source = { sourceSelectedSignatureKind: "resolved",
    sourceSelectedSignatureParameters: parameters.map(() => ({})),
    sourceArguments: parameters.map(() => ({ expression: {} })),
    sourceArgumentBindings: parameters.map((_parameter, index) => ({
      sourceArgumentIndex: index, sourceParameterIndex: index,
      effectiveArgumentIndex: index, sourceForm: "value",
    })),
  };
  const policy = jsCallPolicy(jsMemberIdentity("ArrayConstructor", "from"),
    () => member, { kind: "none" }, { invocationOnlyCallableParameterIndexes: () => indexes });
  return { parameters, member, source, select: () => policy.select({ source }) };
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
  const conservative = fixture([]).select();
  assert.equal(conservative.kind, "resolved");
  assert.equal(conservative.call.invocationOnlyCallableArgumentIndexes === undefined, true);
});

test("malformed invocation-only indexes reject without publishing effects", () => {
  const sparse = new Array(1);
  for (const indexes of [sparse, [undefined], [null], ["1"], [NaN], [Infinity], [-1], [0.5], [2],
    [Number.MAX_VALUE], [1, 1], [1, 1, 1]]) {
    assert.equal(fixture(indexes).select().kind, "rejected", "dense unique finite bounded indexes");
  }
});

test("callable effects reject non-callable, byref, unbound and inconsistent selections", () => {
  assert.equal(fixture([0]).select().kind, "rejected", "non-callable parameter");
  for (const mutate of [
    input => input.parameters[1] = { ...input.parameters[1], passingMode: "by-reference" },
    input => input.source.sourceArgumentBindings.pop(),
    input => input.source.sourceArgumentBindings[1].sourceArgumentIndex = -1,
    input => input.source.sourceArgumentBindings[1].sourceArgumentIndex = 0.5,
    input => input.source.sourceArgumentBindings[1].sourceArgumentIndex = 2,
    input => delete input.source.sourceArguments[1],
    input => input.source.sourceSelectedSignatureKind = "unresolved",
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
