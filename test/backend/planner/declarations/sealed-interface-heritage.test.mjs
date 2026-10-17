import assert from "node:assert/strict";
import test from "node:test";
import { planClassHeritage, planInterfaceHeritage } from "../../../../dist/backend/planner/declarations/classes/heritage.js";
import { renderCsharpStructuralInterfaceMembers, shadowCsharpInheritedInterfaceMembers } from "../../../../dist/backend/planner/objects/declarations/structural-interfaces.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { completeCsharpDeclarationHeritage } from "../../../../dist/analysis/project-types/heritage.js";

function type(argument, id = "Native.View") {
  return { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id, name: "View", typeArguments: [argument], csharpRender: { kind: "named", name: "View" } };
}

test("classes and interfaces consume one deduplicated exact sealed heritage contract", () => {
  const first = { kind: "type-parameter", name: "Value", identity: "first" };
  const second = { kind: "type-parameter", name: "Value", identity: "second" };
  const authored = type(first);
  const repeated = { ...authored };
  const closed = type({ kind: "source-primitive", name: "int64" });
  const shape = { implements: [repeated, type(second), closed] };
  const heritage = completeCsharpDeclarationHeritage({ interfaces: [authored] }, shape);
  const input = { scope: { typeParameterNames: new Map([["first", "First"], ["second", "Second"]]) },
    types: { projectTypes: { heritageForDeclaration: () => heritage } } };
  for (const owner of [planClassHeritage, planInterfaceHeritage]) {
    const diagnostics = [];
    const result = owner({}, input, diagnostics);
    const interfaces = Array.isArray(result) ? result : result.interfaces;
    assert.deepEqual(interfaces.map(contract => contract.typeArguments[0]), [
      { kind: "IdentifierName", name: "First" }, { kind: "IdentifierName", name: "Second" }, { kind: "PredefinedType", name: "long" },
    ], "exact generic identities and native carriers survive structural inheritance");
    assert.equal(diagnostics.length, 0, "no guessed or duplicate native heritage");
  }
});

test("heritage rejects unavailable owner and unrenderable sealed contracts", () => {
  for (const owner of [planClassHeritage, planInterfaceHeritage]) {
    const diagnostics = [];
    assert.throws(() => owner({}, {
      scope: {}, types: { projectTypes: { heritageForDeclaration: () => undefined } },
    }, diagnostics), error => error.message.includes("admitted canonical C# project-type model"),
    "an absent admitted owner never emits an alternative native contract");
    assert.equal(diagnostics.length, 0, "absent internal evidence is not a source rejection");
    const result = owner({}, {
      scope: {}, types: { projectTypes: { heritageForDeclaration: () => ({
        interfaces: [{ kind: "opaque", id: "missing" }],
      }) } },
    }, diagnostics);
    assert.equal((Array.isArray(result) ? result : result.interfaces).length, 0, "no alternative native contract");
    assert.equal(diagnostics.length, 1, "an unrenderable native carrier is still refused until C03 proves total rendering");
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

test("generated method-value handles reuse only the identical available inherited storage", () => {
  const integer = { kind: "source-primitive", name: "int32" };
  const member = { memberKind: "method", sourceName: "read", targetName: "read",
    sourceKey: { kind: "property", name: "read" }, type: csharpDelegateTargetType("System.Func", [integer]) };
  const shape = { members: [member] };
  const storage = { nativeField: { get: () => undefined } };
  const inherited = [{ shape, methodValues: true }];
  const rendered = renderCsharpStructuralInterfaceMembers(undefined, shape, storage, true, inherited);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].kind, "MethodDeclaration");
  assert.deepEqual(rendered[0].modifiers, ["new"]);
  for (const parent of [
    { shape, methodValues: false },
    { shape: { members: [{ ...member, optional: true }] }, methodValues: true },
    { shape: { members: [{ ...member, type: csharpDelegateTargetType("System.Func",
      [{ kind: "source-primitive", name: "uint32" }]) }] }, methodValues: true },
    { shape: { members: [{ ...member, targetName: "other" }] }, methodValues: true },
  ]) {
    const members = renderCsharpStructuralInterfaceMembers(undefined, shape, storage, true, [parent]);
    assert.equal(members.some(candidate => candidate.kind === "PropertyDeclaration"), true,
      "capability, absence, signedness and exact native storage name remain independent gates");
  }
});
