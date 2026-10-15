import assert from "node:assert/strict";
import test from "node:test";
import { csharpPromiseSourceProfileCallPolicies } from "../../../dist/policy/operations/source-profiles/promise-source-profile.js";
import { csharpJsObjectCallPolicies } from "../../../dist/policy/operations/source-profiles/js/objects.js";
import {
  csharpNullableTargetType,
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTaskTargetType,
  csharpTsValueTargetType,
  csharpVoidTargetType,
  getCsharpDelegateSignature,
  getCsharpTaskResultTargetType,
  targetTypeRefEquals,
} from "../../../dist/policy/types/index.js";

const binding = Object.freeze({ sourceArgumentIndex: 0, effectiveArgumentIndex: 0,
  sourceParameterIndex: 0, sourceForm: "value" });

function contextFor(task, changes = {}) {
  const selectedType = {};
  return {
    host: { types: { resolveType(type) {
      assert.equal(type === selectedType, true, "exact selected Task type query");
      return task;
    } } },
    sourceFile: {},
    source: { sourceResultType: selectedType, sourceSelectedSignatureKind: "resolved",
      sourceSelectedSignatureParameters: [{}], sourceArgumentBindings: [binding], ...changes },
  };
}

test("native and JS constructors select one exact immutable native Task completion relation", () => {
  assert.deepEqual(csharpPromiseSourceProfileCallPolicies.map(policy => policy.source), [
    { owner: "csharp", kind: "construct", declaringName: "PromiseConstructor" },
    { owner: "js", kind: "construct", declaringName: "PromiseConstructor" },
  ]);
  assert.equal(csharpJsObjectCallPolicies.some(policy => policy.source.kind === "construct" &&
    policy.source.declaringName === "PromiseConstructor"), false, "old JS-only constructor policy removed");
  for (const result of [csharpVoidTargetType(), csharpSourcePrimitiveTargetType("uint64")]) {
    const task = csharpTaskTargetType(result);
    const choices = csharpPromiseSourceProfileCallPolicies.map(policy => policy.select(contextFor(task)));
    assert.deepEqual(choices[0], choices[1]);
    for (const choice of choices) {
      assert.equal(choice.kind, "resolved");
      const { call } = choice;
      const member = call.targetMember;
      assert.equal(targetTypeRefEquals(member.returnType, task), true, "canonical native Task result");
      assert.deepEqual(call.receiver, { kind: "none" });
      assert.equal(member.targetName, "Create");
      assert.equal(member.csharpInvocation.kind, "static-factory-construction");
      assert.equal(member.csharpInvocation.factoryType.id,
        task.id === "System.Threading.Tasks.Task"
          ? "Tsonic.CSharp.Runtime.TaskCompletion" : "Tsonic.CSharp.Runtime.TaskCompletion`1");
      const executor = getCsharpDelegateSignature(member.parameters[0].type);
      assert.equal(executor.parameters.length, 2);
      const resolve = getCsharpDelegateSignature(executor.parameters[0]);
      const reject = getCsharpDelegateSignature(executor.parameters[1]);
      assert.equal(targetTypeRefEquals(reject.parameters[0], csharpTsValueTargetType()), true,
        "unknown rejection uses canonical closed core value");
      assert.deepEqual(reject.optionalParameterIndexes, [0]);
      const isVoid = task.id === "System.Threading.Tasks.Task";
      assert.equal(targetTypeRefEquals(resolve.parameters[0], isVoid ? csharpNullableTargetType(task)
        : csharpRuntimeUnionTargetType([result, task])), true, "exact value/adopted Task resolution domain");
      assert.deepEqual(resolve.optionalParameterIndexes, isVoid ? [0] : undefined);
      assert.equal(call.arguments[0].targetParameter === member.parameters[0], true,
        "source callback binding retains the selected native executor slot");
      assert.equal(Object.isFrozen(member) && Object.isFrozen(member.parameters) &&
        Object.isFrozen(member.parameters[0].type) && Object.isFrozen(executor.parameters), true);
      assert.throws(() => { executor.parameters[0] = csharpTsValueTargetType(); }, TypeError);
    }
  }
});

test("generic constructor carriers retain exact binder declaration evidence", () => {
  const declaration = Object.create({ astIdentity: true });
  const parameter = { kind: "type-parameter", identity: "fixture.Value", name: "Value", csharpDeclaration: declaration };
  for (const policy of csharpPromiseSourceProfileCallPolicies) {
    const selected = policy.select(contextFor(csharpTaskTargetType(parameter)));
    assert.equal(selected.kind, "resolved");
    const nativeResult = getCsharpTaskResultTargetType(selected.call.targetMember.returnType);
    assert.equal(nativeResult.csharpDeclaration === declaration, true, "exact generic AST identity retained");
    assert.equal(nativeResult.identity, "fixture.Value");
    assert.equal(selected.call.targetMember.csharpInvocation.factoryType.typeArguments[0].identity, "fixture.Value");
  }
});

test("constructor selection fails closed on missing result and inconsistent callback evidence", () => {
  for (const policy of csharpPromiseSourceProfileCallPolicies) {
    const task = csharpTaskTargetType(csharpSourcePrimitiveTargetType("int32"));
    const cases = [contextFor(undefined), contextFor(csharpTsValueTargetType()),
      contextFor(task, { sourceSelectedSignatureKind: "unresolved" }),
      contextFor(task, { sourceSelectedSignatureParameters: [] }),
      contextFor(task, { sourceSelectedSignatureParameters: [{}, {}] }),
      contextFor(task, { sourceArgumentBindings: [] }),
      contextFor(task, { sourceArgumentBindings: [binding, binding] }),
      contextFor(task, { sourceArgumentBindings: [{ ...binding, sourceParameterIndex: 1 }] })];
    for (const [index, context] of cases.entries()) {
      const selected = policy.select(context);
      assert.equal(selected.kind, "rejected", `malformed relation ${index}`);
      assert.equal(selected.diagnostic.extensionCode, "CSHARP_PROMISE_CONSTRUCTION_NOT_CLOSED");
    }
  }
});
