import assert from "node:assert/strict";
import test from "node:test";
import { retainCsharpGenericCallableValue } from "../../../dist/policy/types/callables/generic-values.js";
import { csharpDelegateTargetType, getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../../dist/target-model/types/delegates.js";
import { getCsharpMethodValue, rebindCsharpMethodValueTypeParameters } from "../../../dist/target-model/types/method-values.js";
import { targetTypeRefEquals, targetTypeRefIsClosed } from "../../../dist/target-model/types/equality.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/target-types.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";

function quantifiedChoice(identity, constraints = []) {
  const parameter = { kind: "type-parameter", identity, name: identity };
  const signature = csharpDelegateTargetType("System.Func", [parameter, parameter], parameter);
  const shapes = [];
  const value = retainCsharpGenericCallableValue(signature,
    [{ identity, name: identity, declaration: {}, constraints }], shape => {
      shapes.push(shape);
      return shape;
    });
  return { parameter, signature, shapes, value };
}

test("generic callable storage is a closed native protocol, not a delegate with free quantifiers", () => {
  const selected = quantifiedChoice("Item");
  const method = getCsharpMethodValue(selected.value);
  assert.equal(method !== undefined, true, "quantified invocation contract");
  assert.equal(targetTypeRefIsClosed(selected.value), true, "closed physical storage");
  assert.equal(getCsharpDelegateSignature(selected.value) === undefined, true, "not physical delegate storage");
  assert.equal(getCsharpCallableValueSignature(selected.value).parameters.length, 2);
  assert.equal(targetTypeRefEquals(getCsharpCallableValueSignature(selected.value).returnType, selected.parameter), true);
  assert.equal(method.method, "Invoke");
  assert.equal(selected.value.csharpTypeofRuntimeKind, "function");
  assert.equal(Object.isFrozen(selected.value), true);
  assert.equal(Object.isFrozen(method.typeParameters), true);
  assert.equal(selected.shapes.length, 1);
  assert.equal(selected.shapes[0].members.length, 1);
  assert.equal(selected.shapes[0].members[0].memberKind, "method");
  assert.equal(selected.shapes[0].members[0].typeParameters[0].identity, "Item");
  assert.equal(targetTypeRefEquals(selected.shapes[0].members[0].methodValueContract, method.owner), true);
  assert.equal(csharpTypeFromTargetTypeRef(selected.value).name, csharpTypeFromTargetTypeRef(method.owner).name);
});

test("alpha-equivalent generic callable signatures share the exact native protocol", () => {
  const left = quantifiedChoice("Left");
  const right = quantifiedChoice("Right");
  assert.equal(targetTypeRefEquals(left.value, right.value), true, "one alpha-equivalent carrier");
  const selected = rebindCsharpMethodValueTypeParameters(left.value, [right.parameter]);
  assert.equal(selected !== undefined, true, "exact binder rebinding");
  assert.equal(targetTypeRefEquals(getCsharpMethodValue(selected).owner, getCsharpMethodValue(left.value).owner), true);
  assert.equal(targetTypeRefEquals(getCsharpCallableValueSignature(selected).parameters[0], right.parameter), true);
  assert.equal(targetTypeRefEquals(getCsharpCallableValueSignature(selected).returnType, right.parameter), true);
  const scalar = { kind: "source-primitive", name: "float64" };
  const substituted = substituteTargetTypeParameters(selected, new Map([["Right", scalar]]));
  assert.equal(targetTypeRefEquals(getCsharpCallableValueSignature(substituted).returnType, right.parameter), true,
    "external substitution cannot capture an invocation quantifier");
});

test("generic callable protocols retain constraints and reject malformed quantifiers", () => {
  const selected = quantifiedChoice("Item", [{ kind: "keyword", keyword: "struct" }]);
  const unconstrained = quantifiedChoice("Item");
  assert.equal(targetTypeRefEquals(selected.value, unconstrained.value), false, "constraints identify the native contract");
  assert.equal(selected.shapes[0].members[0].typeParameters[0].constraints[0].keyword, "struct");
  assert.equal(rebindCsharpMethodValueTypeParameters(selected.value, []) === undefined, true, "arity mismatch");
  assert.equal(rebindCsharpMethodValueTypeParameters(selected.value, [{ ...selected.parameter, identity: "" }]) === undefined,
    true, "empty quantifier identity");
  assert.equal(retainCsharpGenericCallableValue(selected.signature, [], shape => shape) === undefined, true,
    "non-generic signatures use ordinary delegates");
  assert.equal(retainCsharpGenericCallableValue(selected.parameter,
    [{ identity: "Item", name: "Item", declaration: {}, constraints: [] }], shape => shape) === undefined, true,
    "not a callable signature");
  assert.equal(retainCsharpGenericCallableValue(selected.signature,
    [{ identity: "Item", name: "Item", declaration: {}, constraints: [] },
      { identity: "Item", name: "Item", declaration: {}, constraints: [] }], shape => shape) === undefined, true,
    "duplicate quantifier identity");
});
