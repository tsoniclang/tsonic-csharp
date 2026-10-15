import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceCallContract } from "../../../dist/policy/types/resolution/call-contracts.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";

const integer = { kind: "source-primitive", name: "int32" };

function fixture(modes, slots) {
  const declaration = {};
  const expression = {};
  const sourceParameter = {};
  const selectedDeclaration = {};
  const carrier = csharpTargetNamedType("Fixture::Native", undefined,
    { kind: "named", name: "Native", usingNamespace: ["Fixture"] },
    { delegateSignature: { parameters: [integer], parameterPassingModes: modes, returnType: integer } });
  const source = { call: {}, selectedSignature: {},
    sourceCallee: { expression, type: {}, selectedDeclaration },
    sourceSelectedSignatureParameters: [{ parameterIndex: 7, parameterDeclaration: sourceParameter }] };
  const scope = { host: {
    ast: { is: { IsNewExpression: () => false, IsFunctionDeclaration: () => false, IsMethodDeclaration: () => false,
      IsClassDeclaration: () => false }, parent: () => undefined, kindName: () => "KindVariableDeclaration" },
    navigation: { sourceReferenceFor: () => ({ declaration }) }, projectTypes: () => ({ catalog: {} }),
    semantics: () => ({ declarations: { signatureDeclaration: () => selectedDeclaration },
      operations: { callParameterSlots: () => slots } }),
  }, resolveSelectedValueWithState: () => carrier, sourceCallableTypeParametersMatch: () => true };
  return { scope, source, sourceParameter, selectedDeclaration };
}

test("stored native callable contracts retain exact passing and checked slot correspondence", () => {
  for (const mode of ["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]) {
    const { scope, source, sourceParameter, selectedDeclaration } = fixture([mode],
      [{ sourceParameterIndex: 7, sourceParameterName: "authored", form: "required" }]);
    const selected = resolveSourceCallContract(scope, source, {}, { depth: 0 }, "checked");
    assert.equal(selected.kind, "value");
    assert.equal(selected.contract.parameters[0].targetParameter.passingMode, mode);
    assert.equal(selected.contract.parameters[0].sourceParameter === sourceParameter, true);
    assert.equal(selected.contract.parameters[0].targetParameter.name, "authored");
    assert.equal(selected.contract.sourceDeclaration === selectedDeclaration, true);
  }
});

test("stored native callable contracts reject malformed modes and mismatched argument correspondence", () => {
  const valid = [{ sourceParameterIndex: 7, sourceParameterName: "authored", form: "required" }];
  for (const [modes, slots] of [[undefined, valid], [[], valid], [new Array(1), valid], [["by-value", "by-value"], valid], [["move"], valid],
    [["by-value"], []], [["by-value"], [{ sourceParameterIndex: 8, sourceParameterName: "authored", form: "required" }]]]) {
    const { scope, source } = fixture(modes, slots);
    assert.equal(resolveSourceCallContract(scope, source, {}, { depth: 0 }, "checked").kind, "rejected");
  }
});
