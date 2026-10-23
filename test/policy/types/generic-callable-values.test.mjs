import assert from "node:assert/strict";
import test from "node:test";
import { retainCsharpGenericCallableValue } from "../../../dist/analysis/callables/generic-values.js";
import { csharpDelegateTargetType, getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpMethodValueType, getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { rebindCsharpMethodValueTypeParameters } from "../../../dist/policy/types/callables/method-values.js";
import { targetTypeRefEquals, targetTypeRefIsClosed } from "../../../dist/target-model/types/equality.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/render.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";

const unconstrainedEnvironment = () => ({ kind: "resolved", constraints: [] });

function quantifiedChoice(identity, constraints = []) {
  const parameter = { kind: "type-parameter", identity, name: identity,
    csharpConstraints: { kind: "resolved", constraints } };
  const signature = csharpDelegateTargetType("System.Func", [parameter, parameter], parameter);
  const shapes = [];
  const value = retainCsharpGenericCallableValue(signature,
    [{ identity, name: identity, declaration: {}, constraints }], shape => {
      shapes.push(shape);
      return shape;
    }, unconstrainedEnvironment);
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
  const selected = rebindCsharpMethodValueTypeParameters(left.value, [left.parameter], [right.parameter]);
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
  assert.equal(rebindCsharpMethodValueTypeParameters(selected.value, [selected.parameter], []) === undefined, true, "arity mismatch");
  assert.equal(rebindCsharpMethodValueTypeParameters(selected.value, [selected.parameter], [{ ...selected.parameter, identity: "" }]) === undefined,
    true, "empty quantifier identity");
  assert.equal(rebindCsharpMethodValueTypeParameters(selected.value, [selected.parameter], [unconstrained.parameter]) === undefined,
    true, "alpha correspondence cannot erase an actual native struct constraint");
  assert.equal(rebindCsharpMethodValueTypeParameters(unconstrained.value, [unconstrained.parameter], [selected.parameter]) === undefined,
    true, "alpha correspondence cannot invent a stronger native constraint");
  assert.equal(retainCsharpGenericCallableValue(selected.signature, [], shape => shape, unconstrainedEnvironment) === undefined, true,
    "non-generic signatures use ordinary delegates");
  assert.equal(retainCsharpGenericCallableValue(selected.parameter,
    [{ identity: "Item", name: "Item", declaration: {}, constraints: [] }], shape => shape, unconstrainedEnvironment) === undefined, true,
    "not a callable signature");
  assert.equal(retainCsharpGenericCallableValue(selected.signature,
    [{ identity: "Item", name: "Item", declaration: {}, constraints: [] },
      { identity: "Item", name: "Item", declaration: {}, constraints: [] }], shape => shape, unconstrainedEnvironment) === undefined, true,
    "duplicate quantifier identity");
});

test("raw callable contexts rebind actual quantifiers without capturing outer parameters", () => {
  const left = quantifiedChoice("Left", [{ kind: "keyword", keyword: "struct" }]);
  const right = quantifiedChoice("Right", [{ kind: "keyword", keyword: "struct" }]);
  const outer = { kind: "type-parameter", identity: "Outer", name: "Outer" };
  const signature = csharpDelegateTargetType("System.Func", [left.parameter, outer], left.parameter);
  const selected = rebindCsharpMethodValueTypeParameters(signature, [left.parameter], [right.parameter]);
  const rebound = getCsharpDelegateSignature(selected);
  assert.equal(rebound !== undefined, true, "a raw delegate carries the rebound callable context");
  assert.equal(rebound.parameters[0] === right.parameter, true, "actual destination quantifier retained");
  assert.equal(rebound.parameters[0].csharpConstraints.constraints[0].keyword, "struct", "native constraints retained");
  assert.equal(rebound.parameters[1] === outer, true, "unrelated enclosing binder unchanged");
  assert.equal(rebound.returnType === right.parameter, true, "return context uses the same actual destination binder");
  assert.throws(() => rebindCsharpMethodValueTypeParameters(left.value, [right.parameter]), TypeError,
    "the removed two-argument API is not an alternative binding path");
});

test("full native projection vectors rebind independent of order and keep unused native parameters", () => {
  const makeParameters = identity => {
    const parameter = quantifiedChoice(identity).parameter;
    const storage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [parameter] });
    const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [parameter] });
    const declaration = {};
    const inner = csharpProjectedType({ kind: "conditional", declaration, identity: "inner", sourceName: "Inner",
      sourceArguments: [], arguments: [storage] });
    const outer = csharpProjectedType({ kind: "conditional", declaration, identity: "outer", sourceName: "Outer",
      sourceArguments: [], arguments: [inner] });
    const native = projection => ({ ...projection,
      csharpConstraints: { kind: "resolved", constraints: projection.csharpProjectionConstraints } });
    return { parameter, outer: native(outer), inner: native(inner), storage: native(storage), operations: native(operations) };
  };
  const left = makeParameters("Left");
  const right = makeParameters("Right");
  const sourceParameters = [left.parameter, left.outer, left.operations, left.inner, left.storage];
  const targetParameters = [right.parameter, right.storage, right.inner, right.outer, right.operations];
  const signature = csharpDelegateTargetType("System.Func", [left.parameter], left.outer);
  const shapes = [];
  const value = retainCsharpGenericCallableValue(signature,
    sourceParameters.map(parameter => ({ identity: parameter.identity, name: parameter.name, declaration: {},
      constraints: parameter.csharpConstraints.constraints })), shape => { shapes.push(shape); return shape; },
    parameter => parameter.csharpConstraints ?? unconstrainedEnvironment());
  assert.equal(value !== undefined, true, "actual full native protocol fixture");
  const permissions = [false, true, false, true, false];
  const source = Object.freeze({ ...value, csharpMethodValue: Object.freeze({ ...getCsharpMethodValue(value),
    allowsRefLikeTypeArguments: Object.freeze(permissions) }) });
  const rebound = rebindCsharpMethodValueTypeParameters(source, sourceParameters, targetParameters);
  const selected = getCsharpMethodValue(rebound);
  assert.equal(selected !== undefined, true, "nested native projections have one alpha correspondence");
  assert.equal(selected.typeParameters.length, 5, "unused projection-only native parameters are not dropped");
  assert.equal(selected.typeParameters.every((identity, index) => identity === targetParameters[index].identity), true,
    "the actual native destination order is retained");
  assert.equal(targetTypeRefEquals(getCsharpDelegateSignature(selected.contract).returnType, right.outer), true,
    "nested projection return metadata uses the destination native binder");
  assert.equal(selected.allowsRefLikeTypeArguments.every((allowed, index) =>
    allowed === [false, false, true, true, false][index]), true, "anti-constraints follow actual alpha correspondence");
  assert.equal(rebindCsharpMethodValueTypeParameters(source, sourceParameters, targetParameters.slice(0, -1)) === undefined,
    true, "a missing unused native projection is not silently accepted");
  assert.equal(rebindCsharpMethodValueTypeParameters(source, sourceParameters,
    [right.parameter, right.storage, right.inner, right.outer, right.outer]) === undefined,
    true, "duplicate native destination quantifiers are refused");
  assert.equal(rebindCsharpMethodValueTypeParameters(source, sourceParameters,
    [{ ...right.parameter, identity: "Foreign" }, right.storage, right.inner, right.outer, right.operations]) === undefined,
    true, "projection identity is proven from actual bound arguments, not vector position");
  assert.equal(shapes.length, 1, "one retained protocol owner");
});

test("nested callable invocation binders are not free captured owner parameters", () => {
  const inner = quantifiedChoice("Inner");
  const outer = { kind: "type-parameter", identity: "Outer", name: "Outer" };
  const signature = csharpDelegateTargetType("System.Func", [outer], inner.value);
  assert.deepEqual([...csharpFreeTypeParameterIdentities([signature])], ["Outer"]);
  const shapes = [];
  const selected = retainCsharpGenericCallableValue(signature,
    [{ identity: "Outer", name: "Outer", declaration: {}, constraints: [] }], shape => {
      shapes.push(shape);
      return shape;
    }, unconstrainedEnvironment);
  assert.equal(selected !== undefined, true, "closed outer invocation contract");
  assert.equal(targetTypeRefIsClosed(selected), true, "one closed physical owner");
  assert.equal(getCsharpMethodValue(getCsharpCallableValueSignature(selected).returnType).typeParameters[0], "Inner");
  assert.equal(shapes.length, 1);
  const scalar = { kind: "source-primitive", name: "float64" };
  const substituted = substituteTargetTypeParameters(selected, new Map([["Outer", scalar], ["Inner", scalar]]));
  assert.equal(targetTypeRefEquals(getCsharpCallableValueSignature(substituted).parameters[0], outer), true,
    "substitution cannot capture the outer invocation binder");
  assert.equal(targetTypeRefEquals(getCsharpCallableValueSignature(getCsharpCallableValueSignature(substituted).returnType).returnType,
    inner.parameter), true, "substitution cannot capture the nested invocation binder");
});

test("free parameter discovery distinguishes the same type inside and outside a nested quantifier", () => {
  const inner = quantifiedChoice("Item");
  const signature = csharpDelegateTargetType("System.Func", [inner.value, inner.parameter], inner.value);
  assert.deepEqual([...csharpFreeTypeParameterIdentities([signature])], ["Item"], "unbound sibling remains visible");
  const retained = retainCsharpGenericCallableValue(signature,
    [{ identity: "Outer", name: "Outer", declaration: {}, constraints: [] }], shape => shape, unconstrainedEnvironment);
  assert.equal(retained !== undefined, true, "an exact enclosing parameter is retained on its native generic owner");
  assert.deepEqual([...csharpFreeTypeParameterIdentities([getCsharpMethodValue(retained).owner])], ["Item"]);
  const unrelatedOwner = getCsharpMethodValue(quantifiedChoice("Other").value).owner;
  assert.equal(csharpMethodValueType(unrelatedOwner, "Invoke", "foreign-owner", signature, ["Outer"]) === undefined, true,
    "a genuinely foreign parameter absent from the owner and invocation binders is rejected");
});
