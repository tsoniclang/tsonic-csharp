// Native delegate call contracts (nextgen C-2542). A call through a native delegate value pairs the delegate's CLR
// parameters with the Host-selected signature declaration's authored parameters (facts.selections.call -> signature).
// Passing modes come from the .NET delegate only; the Source side contributes parameter declarations and forms.
import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceCallableValueAbi } from "../../../dist/analysis/callables/calls/source-callable-abi.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";

const integer = { kind: "source-primitive", name: "int32" };

function fixture(modes, slots) {
  const selectedDeclaration = Object.freeze({ kind: "selected-signature" });
  const names = new Map();
  const parameters = slots.map(slot => {
    const name = Object.freeze({ kind: "identifier" });
    names.set(name, slot.name);
    return Object.freeze({ kind: "parameter", name, DotDotDotToken: slot.form === "rest" ? {} : undefined,
      QuestionToken: slot.form === "optional" ? {} : undefined, Initializer: undefined });
  });
  const ast = {
    parameters: node => node === selectedDeclaration ? parameters : assert.fail("only the selected signature is read"),
    as: { AsParameterDeclaration: node => node },
    is: { IsIdentifier: node => names.has(node) },
    text: node => names.get(node),
  };
  const facts = { navigation: { identity: { isProjectDeclaration: node => {
    assert.equal(node, selectedDeclaration);
    return false;
  } } } };
  const carrier = csharpTargetNamedType("Fixture::Native", undefined, { kind: "named", name: "Native", usingNamespace: ["Fixture"] },
    { allowsRefLikeTypeArguments: [], delegateSignature: { parameters: [integer], parameterPassingModes: modes, returnType: integer } });
  const select = () => selectCsharpSourceCallableValueAbi({ ast, facts, source: { signature: selectedDeclaration }, carrier });
  return { select, parameters, selectedDeclaration };
}

test("stored native callable contracts retain exact passing and Host-selected slot correspondence", () => {
  for (const mode of ["by-value", "byref-readonly", "byref-readwrite", "byref-writeonly-must-init"]) {
    const { select, parameters, selectedDeclaration } = fixture([mode], [{ name: "authored", form: "required" }]);
    const selected = select();
    assert.equal(selected?.kind, "native");
    assert.equal(selected.nativeParameters[0].targetParameter.passingMode, mode);
    assert.equal(selected.nativeParameters[0].sourceParameter === parameters[0], true);
    assert.equal(selected.nativeParameters[0].targetParameter.name, "authored");
    assert.equal(selected.sourceDeclaration === selectedDeclaration, true);
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.nativeParameters[0].targetParameter), true);
  }
});

test("stored native callable contracts reject malformed modes and mismatched parameter correspondence", () => {
  const valid = [{ name: "authored", form: "required" }];
  for (const [modes, slots] of [[undefined, valid], [[], valid], [new Array(1), valid], [["by-value", "by-value"], valid], [["move"], valid],
    [["by-value"], []], [["by-value"], [...valid, { name: "extra", form: "required" }]],
    [["by-value"], [{ name: "authored", form: "optional" }]], [["by-value"], [{ name: "authored", form: "rest" }]]]) {
    const { select } = fixture(modes, slots);
    assert.equal(select(), undefined, JSON.stringify({ modes, slots }));
  }
});
