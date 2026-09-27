import assert from "node:assert/strict";
import test from "node:test";
import { validateDotnetProviderDeclarationModelContract } from "../../../../dist/providers/native/model/contract/entry.js";

function model(members) {
  return {
    moduleSpecifier: "@test/native/syntax.js", providerModuleId: "Native.Syntax",
    exports: [{ id: "Syntax", name: "syntax", kind: "namespace", members }],
  };
}

test("C# source declaration diagnostics consume the shared member identity owner", () => {
  const first = { id: "First", name: "select", kind: "intrinsic" };
  for (const second of [
    { id: "Second", name: "select", kind: "intrinsic" },
    { id: "Second", name: { kind: "string-literal", text: "select" }, kind: "property", type: { kind: "number" } },
    { id: "Second", name: { kind: "identifier", text: "select" }, kind: "method", signatures: [{ id: "Second.Call", parameters: [], returnType: { kind: "void" } }] },
  ]) {
    const diagnostic = validateDotnetProviderDeclarationModelContract(model([first, second]));
    assert.equal(diagnostic?.code, "DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID");
    assert.match(JSON.stringify(diagnostic), /\$\.exports\[0\]\.members\[1\]\.name/u);
  }
  assert.equal(validateDotnetProviderDeclarationModelContract(model([first, { ...first, id: "Other", name: "Select" }])), undefined);
});

test("C# retains ordinary provider property key collisions without losing static separation", () => {
  const first = { id: "First", name: "1", kind: "property", type: { kind: "number" } };
  const second = { id: "Second", name: { kind: "number-literal", value: 1 }, kind: "field", type: { kind: "number" } };
  const input = model([first, second]);
  input.exports[0].kind = "class";
  assert.equal(validateDotnetProviderDeclarationModelContract(input)?.code, "DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID");
  second.static = true;
  assert.equal(validateDotnetProviderDeclarationModelContract(input), undefined);
});
