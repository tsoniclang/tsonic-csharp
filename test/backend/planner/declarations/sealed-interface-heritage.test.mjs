import assert from "node:assert/strict";
import test from "node:test";
import { planClassHeritage, planInterfaceHeritage } from "../../../../dist/backend/planner/declarations/classes/heritage.js";
import { shadowCsharpInheritedInterfaceMembers } from "../../../../dist/backend/planner/objects/declarations/structural-interfaces.js";

function type(argument, id = "Native.View") {
  return { kind: "target-named", id, name: "View", typeArguments: [argument], csharpRender: { kind: "named", name: "View" } };
}

test("classes and interfaces consume one deduplicated exact sealed heritage contract", () => {
  const first = { kind: "type-parameter", name: "Value", identity: "first" };
  const second = { kind: "type-parameter", name: "Value", identity: "second" };
  const authored = type(first);
  const repeated = { ...authored };
  const closed = type({ kind: "source-primitive", name: "int64" });
  const shape = { implements: [repeated, type(second), closed] };
  const input = { scope: { typeParameterNames: new Map([["first", "First"], ["second", "Second"]]) },
    types: { projectTypes: { heritageForDeclaration: () => ({ interfaces: [authored] }) } } };
  for (const owner of [planClassHeritage, planInterfaceHeritage]) {
    const diagnostics = [];
    const result = owner({}, shape, input, diagnostics);
    const interfaces = Array.isArray(result) ? result : result.interfaces;
    assert.deepEqual(interfaces.map(contract => contract.typeArguments[0]), [
      { kind: "IdentifierName", name: "First" }, { kind: "IdentifierName", name: "Second" }, { kind: "PredefinedType", name: "long" },
    ], "exact generic identities and native carriers survive structural inheritance");
    assert.equal(diagnostics.length, 0, "no guessed or duplicate native heritage");
  }
});

test("heritage rejects unavailable owner and unrenderable sealed contracts", () => {
  for (const owner of [planClassHeritage, planInterfaceHeritage]) {
    for (const heritage of [undefined, { interfaces: [] }]) {
      const diagnostics = [];
      const result = owner({}, { implements: [{ kind: "opaque", id: "missing" }] }, {
        scope: {}, types: { projectTypes: { heritageForDeclaration: () => heritage } },
      }, diagnostics);
      assert.equal((Array.isArray(result) ? result : result.interfaces).length, 0, "no alternative native contract");
      assert.equal(diagnostics.length, 1, "exact owner or carrier is mandatory");
    }
  }
});

test("inherited interface hiding preserves existing modifiers and untouched members", () => {
  const members = [
    { kind: "PropertyDeclaration", name: "value", modifiers: ["unsafe"], writable: true },
    { kind: "MethodDeclaration", name: "invoke", modifiers: ["safe"] },
    { kind: "PropertyDeclaration", name: "independent", writable: false },
    { kind: "IndexerDeclaration", writable: false },
  ];
  const inherited = [{ kind: "PropertyDeclaration", name: "value" }, { kind: "MethodDeclaration", name: "invoke" }];
  const result = shadowCsharpInheritedInterfaceMembers(members, inherited);
  assert.deepEqual(result[0].modifiers, ["new", "unsafe"]);
  assert.deepEqual(result[1].modifiers, ["new", "safe"]);
  assert.equal(result[2] === members[2] && result[3] === members[3], true, "unrelated members retain exact native AST identity");
  assert.deepEqual(members[0].modifiers, ["unsafe"], "sealed inputs remain immutable");
});
