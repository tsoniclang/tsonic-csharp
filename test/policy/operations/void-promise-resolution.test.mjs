import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsPromiseCallPolicies } from "../../../dist/policy/operations/source-profiles/js/promises.js";
import { csharpAbsenceTargetType, csharpSourcePrimitiveTargetType, csharpTaskTargetType,
  csharpVoidTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const voidType = csharpVoidTargetType();
const wide = csharpSourcePrimitiveTargetType("int64");
const cases = [
  ["absent completion", csharpAbsenceTargetType(), voidType, "absence"],
  ["effectful void completion", voidType, voidType, "absence"],
  ["existing void Task", csharpTaskTargetType(voidType), voidType, "task"],
  ["exact native value", wide, wide, undefined],
  ["existing native Task", csharpTaskTargetType(wide), wide, undefined],
];

for (const [name, argument, payload, nativeForm] of cases) {
  test(`JS Promise.resolve retains ${name} and its exact source argument`, () => {
    const expression = {};
    const publishedArgument = { kind: "declared", declaration: {}, typeArguments: [] };
    const publishedResult = { kind: "declared", declaration: {}, typeArguments: [] };
    const binder = {};
    const selectedType = { kind: "declared", declaration: {}, typeArguments: [] };
    const call = {};
    const selectedArgument = { binder, type: selectedType, explicit: true };
    const result = csharpTaskTargetType(payload);
    const selected = csharpJsPromiseCallPolicies.find(policy => policy.source.declaringName === "PromiseConstructor" &&
      policy.source.name === "resolve").select({
      source: {
        call, selection: { use: call, result: publishedResult },
        parameters: [{ name: "value", kind: "required", type: publishedArgument }],
        typeArguments: [selectedArgument],
        arguments: [{ expression, type: publishedArgument }],
        bindings: [{ argument: expression, argumentIndex: 0, effectiveIndex: 0,
          parameterIndex: 0, mode: "positional", form: "value" }],
      },
      inputs: { values: new Map([[expression, argument]]),
        results: new Map([[call, result]]), typeArgument: { get: selected => {
          assert.equal(selected === selectedArgument && selected.binder === binder && selected.type === selectedType, true,
            "only the Host instantiation's explicit binder record is queried");
          return payload;
        } } },
    });
    assert.equal(selected.kind, "resolved", "one exact native argument closes the existing checked relation");
    const member = selected.call.targetMember;
    assert.equal(targetTypeRefEquals(member.returnType, result), true, "the native completion carrier is unchanged");
    assert.equal(member.parameters.length, 1, "the supplied source expression is not erased");
    assert.equal(selected.call.arguments.length, 1, "the source argument occurs exactly once");
    const binding = selected.call.arguments[0];
    assert.equal(binding.sourceArgumentIndex === 0 && binding.effectiveArgumentIndex === 0 &&
      binding.targetParameterIndex === 0, true, "source and native argument correspondence is exact");
    assert.equal(selected.call.targetMethodTypeArguments.length, 0, "no fake generic void argument is introduced");
    if (nativeForm === undefined) {
      assert.equal(member.targetName, name === "exact native value" ? "Resolved" : "Resolve",
        "the existing non-void JS value and Task branches remain unchanged");
      assert.equal(targetTypeRefEquals(member.parameters[0].type, argument), true, "the exact native value or Task is forwarded");
    } else {
      assert.equal(member.csharpInvocation?.kind, "native-task-resolution", "void uses the existing native resolution form");
      assert.equal(member.csharpInvocation.form, nativeForm, "absence and Task identity remain distinct native forms");
      assert.equal(targetTypeRefEquals(member.parameters[0].type,
        nativeForm === "absence" ? csharpAbsenceTargetType() : argument), true,
      "effectful void admits existing absence storage without a void value parameter");
    }
  });
}
