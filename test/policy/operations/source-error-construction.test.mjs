import assert from "node:assert/strict";
import test from "node:test";
import { csharpErrorSourceProfileCallPolicies, csharpErrorSourceProfilePropertyPolicies } from "../../../dist/policy/operations/source-profiles/error-source-profile.js";
import { csharpNullableTargetType, csharpRuntimeErrorTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";

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
    assert.deepEqual(policy.select().targetMember.returnType, csharpStringTargetType());
  }
});
