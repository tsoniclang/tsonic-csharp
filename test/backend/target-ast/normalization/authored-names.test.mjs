import assert from "node:assert/strict";
import test from "node:test";
import { preserveCsharpAuthoredNames } from "../../../../dist/backend/target-ast/normalization/authored-names.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/index.js";

const scalar = { kind: "PredefinedType", keyword: "int" };
const method = name => ({ kind: "MethodDeclaration", name: "identity", modifiers: ["public"],
  typeParameters: [{ name }], returnType: scalar, parameters: [], body: { kind: "Block", statements: [] } });

test("C# generic shadowing preserves names and limits CS0693 to the exact signature", () => {
  const declarations = ["ClassDeclaration", "StructDeclaration", "InterfaceDeclaration"].map(kind => ({
    kind, name: "Container", modifiers: ["public"], typeParameters: [{ name: "T" }],
    members: [method("T"), { ...method("U"), name: "other" }].map(member =>
      kind === "InterfaceDeclaration" ? { ...member, body: undefined } : member),
  }));
  const unit = { kind: "CompilationUnit", usings: [], members: [{ kind: "NamespaceDeclaration", name: "Proof", members: declarations }] };
  const normalized = preserveCsharpAuthoredNames(unit);
  for (const declaration of normalized.members[0].members) {
    assert.deepEqual(declaration.typeParameters, [{ name: "T" }]);
    assert.deepEqual(declaration.members[0].typeParameters, [{ name: "T" }]);
    assert.equal(declaration.members[0].shadowsEnclosingTypeParameter, true);
    assert.equal(declaration.members[1].shadowsEnclosingTypeParameter, undefined);
  }
  assert.deepEqual(preserveCsharpAuthoredNames(normalized), normalized);
  const output = printCsharpCompilationUnit(normalized);
  assert.equal(output.match(/#pragma warning disable CS0693/gu)?.length, 3);
  assert.equal(output.match(/#pragma warning restore CS0693/gu)?.length, 3);
  assert.match(output, /identity<T>\(\)\s*#pragma warning restore CS0693\s*\{/u);
  assert.doesNotMatch(output, /(?:identity<T2>|#pragma warning disable\s*(?:\n|$))/u);
});

test("C# naming dispositions are recomputed from current scopes, including escaped identifiers", () => {
  const unit = { kind: "CompilationUnit", usings: [], members: [{ kind: "ClassDeclaration", name: "Value",
    modifiers: [], typeParameters: [{ name: "@event" }], members: [method("event")] }] };
  const normalized = preserveCsharpAuthoredNames(unit);
  assert.equal(normalized.members[0].members[0].shadowsEnclosingTypeParameter, true);
  const renamedScope = { ...normalized, members: [{ ...normalized.members[0], typeParameters: [{ name: "Other" }] }] };
  assert.equal(preserveCsharpAuthoredNames(renamedScope).members[0].members[0].shadowsEnclosingTypeParameter, undefined);
});
