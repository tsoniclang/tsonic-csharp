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
    const checkedArgument = {};
    const checkedResult = {};
    const explicitTypeNode = {};
    const selectedType = {};
    const result = csharpTaskTargetType(payload);
    const selected = csharpJsPromiseCallPolicies.find(policy => policy.source.declaringName === "PromiseConstructor" &&
      policy.source.name === "resolve").select({
      source: {
        sourceResultType: checkedResult, sourceSelectedSignatureKind: "resolved",
        sourceSelectedSignatureParameters: [{}],
        sourceSelectedMethodTypeArguments: [{ explicitTypeNode, selectedType }],
        sourceArguments: [{ expression, type: checkedArgument }],
        sourceArgumentBindings: [{ sourceArgumentIndex: 0, effectiveArgumentIndex: 0,
          sourceParameterIndex: 0, sourceForm: "value" }],
      },
      inputs: { values: new Map([[expression, new Map([[checkedArgument, argument]])]]),
        types: new Map([[checkedResult, result]]), selectedType: { get: (node, type) => {
          assert.equal(node === explicitTypeNode && type === selectedType, true, "only the actual selected explicit type is queried");
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
