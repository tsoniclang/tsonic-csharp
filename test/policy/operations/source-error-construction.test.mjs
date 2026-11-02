import assert from "node:assert/strict";
import test from "node:test";
import { csharpErrorSourceProfileCallPolicies, csharpErrorSourceProfilePropertyPolicies } from "../../../dist/policy/operations/source-profiles/error-source-profile.js";
import { csharpExceptionTargetType, csharpNullableTargetType, csharpRuntimeErrorTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";
import { selectCsharpTargetCallEmission } from "../../../dist/policy/operations/members/target-call-emission.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { isCsharpVoidTargetType } from "../../../dist/target-model/types/identity.js";

const host = { providers: createSourceErrorProviderFixture(), projectTypes: { directSupertypes: () => [] } };

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
    const type = name === "Error" ? csharpExceptionTargetType() : csharpRuntimeErrorTargetType(name);
    assert.equal(constructor.id, `${type.id}..ctor`);
    assert.deepEqual(constructor.declaringType, type);
    assert.deepEqual(constructor.returnType, constructor.declaringType);
    assert.deepEqual(constructor.parameters, [{ name: "message", type: csharpNullableTargetType(csharpStringTargetType()),
      passingMode: "by-value", optional: true, csharpOmittableOptionalArgument: true },
      { name: "innerException", type: csharpNullableTargetType(csharpExceptionTargetType()),
        passingMode: "by-value", optional: true, csharpOmittableOptionalArgument: true }]);
    constructors++;
  }
  assert.equal(constructors, 5);
  for (const policy of csharpErrorSourceProfilePropertyPolicies.filter(policy => policy.source.name === "message")) {
    assert.deepEqual(policy.select({ host, source: { accessMode: "read" }, receiverType: csharpRuntimeErrorTargetType() }).targetMember.returnType,
      csharpStringTargetType());
  }
});

test("native Exception observation consumes immutable exact property records and rejects writes", () => {
  const expected = new Map([["name", ["System.Type.Name", "receiver-call"]],
    ["message", ["System.Exception.Message", "member"]],
    ["stack", ["System.Exception.StackTrace", "member"]],
    ["cause", ["System.Exception.InnerException", "member"]]]);
  for (const policy of csharpErrorSourceProfilePropertyPolicies) {
    const context = { host, receiverType: csharpExceptionTargetType(), source: { accessMode: "read" } };
    const selected = policy.select(context);
    assert.equal(selected.kind, "resolved");
    assert.deepEqual([selected.targetMember.id, selected.invocation.kind], expected.get(policy.source.name));
    if (policy.source.name === "name") {
      assert.equal(selected.invocation.call.id, "System.Object.GetType");
      assert.equal(selected.invocation.call.parameters.length, 0);
      assert.equal(selected.invocation.call.static, undefined);
      assert.equal(selected.targetMember.readonly, true);
      assert.equal(selected.invocation.call.returnType.id, selected.targetMember.declaringType.id);
    }
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.targetMember) && Object.isFrozen(selected.receiver), true);
    assert.throws(() => { selected.targetMember.id = "changed"; }, TypeError);
    for (const accessMode of ["write", "read-write"])
      assert.equal(policy.select({ ...context, source: { accessMode } }).kind, "rejected");
    assert.equal(policy.select(context).targetMember.id, expected.get(policy.source.name)[0]);
  }
});

test("native capture predicate admission requires one exact readonly operand and the source void contract", () => {
  const exception = csharpExceptionTargetType();
  const owner = csharpTargetNamedType("System.Runtime.ExceptionServices.ExceptionDispatchInfo", undefined,
    csharpQualifiedTypeRenderShape("System.Runtime.ExceptionServices", "ExceptionDispatchInfo"), { allowsRefLikeTypeArguments: [] });
  const property = { kind: "property", id: "System.Exception.StackTrace", targetName: "StackTrace", readonly: true,
    declaringType: exception, parameters: [], returnType: csharpNullableTargetType(csharpStringTargetType()) };
  const member = { kind: "method", id: "System.Runtime.ExceptionServices.ExceptionDispatchInfo.SetCurrentStackTrace",
    targetName: "SetCurrentStackTrace", static: true, declaringType: owner,
    parameters: [{ name: "error", type: exception, passingMode: "by-value" }], returnType: exception };
  const condition = { kind: "argument-property-absent", targetParameterIndex: 0, property };
  const selection = { origin: "source-profile", receiver: { kind: "none" }, targetMember: member,
    discardResult: true, condition };
  const input = { source: {}, selection, argumentPassing: [false], optional: false,
    projection: undefined, liftedResult: undefined };
  const selected = selectCsharpTargetCallEmission(input);
  assert.equal(selected.kind, "selected");
  assert.equal(selected.value.invocation.kind, "guarded-method");
  assert.equal(selected.value.invocation.condition === condition, true, "the exact policy predicate is sealed without reselection");
  assert.equal(isCsharpVoidTargetType(selected.value.result), true,
    "the source void result never replaces the native method's physical Exception result");
  for (const [label, change] of [
    ["writable property", { condition: { ...condition, property: { ...property, readonly: false } } }],
    ["static property", { condition: { ...condition, property: { ...property, static: true } } }],
    ["foreign owner", { condition: { ...condition, property: { ...property, declaringType: csharpRuntimeErrorTargetType() } } }],
    ["nonnullable property", { condition: { ...condition, property: { ...property, returnType: csharpStringTargetType() } } }],
    ["indexed property", { condition: { ...condition, property: { ...property, parameters: member.parameters } } }],
    ["wrong operand", { condition: { ...condition, targetParameterIndex: 1 } }],
    ["physical result exposed", { discardResult: false }],
    ["foreign selection", { origin: "provider" }],
    ["competing invocation", { targetMember: { ...member, csharpInvocation: { kind: "value-identity" } } }],
  ]) {
    assert.equal(selectCsharpTargetCallEmission({ ...input, selection: { ...selection, ...change } }).kind,
      "rejected", label);
  }
  for (const passing of [[], [true], [false, false]]) {
    assert.equal(selectCsharpTargetCallEmission({ ...input, argumentPassing: passing }).kind, "rejected",
      "one by-value argument is required before planning");
  }
});
