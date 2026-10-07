import assert from "node:assert/strict";
import test from "node:test";
import { csharpErrorSourceProfileCallPolicies, csharpErrorSourceProfilePropertyPolicies } from "../../../dist/policy/operations/source-profiles/error-source-profile.js";
import { csharpExceptionTargetType, csharpNullableTargetType, csharpRuntimeErrorTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";

test("source error construction and inheritance consume one exact native profile contract", () => {
  let constructors = 0;
  for (const policy of csharpErrorSourceProfileCallPolicies) {
    if (policy.source.kind !== "construct") {
      assert.equal(policy.inheritableConstructor, undefined);
      continue;
    }
    const constructor = policy.inheritableConstructor;
    assert.ok(constructor);
    const name = policy.source.declaringName.replace(/Constructor$/u, "");
    assert.equal(constructor.kind, "constructor");
    assert.equal(constructor.id, `Tsonic.CSharp.Runtime.${name}..ctor`);
    assert.deepEqual(constructor.declaringType, csharpRuntimeErrorTargetType(name));
    assert.deepEqual(constructor.returnType, constructor.declaringType);
    assert.deepEqual(constructor.parameters, [{ name: "message", type: csharpNullableTargetType(csharpStringTargetType()),
      passingMode: "by-value", optional: true, csharpOmittableOptionalArgument: true }]);
    constructors++;
  }
  assert.equal(constructors, 5);
  for (const policy of csharpErrorSourceProfilePropertyPolicies.filter(policy => policy.source.name === "message")) {
    assert.deepEqual(policy.select({ source: { accessMode: "read" }, receiverType: csharpRuntimeErrorTargetType() }).targetMember.returnType,
      csharpStringTargetType());
  }
});

test("native Exception observation consumes immutable exact property records and rejects writes", () => {
  const expected = new Map([["name", ["Tsonic.CSharp.Runtime.ErrorObject.name", "receiver-call"]],
    ["message", ["System.Exception.Message", "member"]],
    ["stack", ["Tsonic.CSharp.Runtime.ErrorObject.stack", "receiver-call"]]]);
  for (const policy of csharpErrorSourceProfilePropertyPolicies) {
    const context = { receiverType: csharpExceptionTargetType(), source: { accessMode: "read" } };
    const selected = policy.select(context);
    assert.equal(selected.kind, "resolved");
    assert.deepEqual([selected.targetMember.id, selected.invocation.kind], expected.get(policy.source.name));
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.targetMember) && Object.isFrozen(selected.receiver), true);
    assert.throws(() => { selected.targetMember.id = "changed"; }, TypeError);
    for (const accessMode of ["write", "read-write"])
      assert.equal(policy.select({ ...context, source: { accessMode } }).kind, "rejected");
    assert.equal(policy.select(context).targetMember.id, expected.get(policy.source.name)[0]);
  }
});
