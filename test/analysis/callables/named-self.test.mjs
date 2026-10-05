import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpNamedSelfBinding } from "../../../dist/analysis/callables/named-self.js";

function fixture() {
  const declaration = {};
  const name = {};
  const call = {};
  const value = {};
  const otherDeclaration = {};
  const lexical = { selfReferences: [call, value], captures: [], receivers: [] };
  const uses = [
    { reference: call, kind: "direct-call", role: "call-target" },
    { reference: value, kind: "first-class", role: "comparison" },
  ];
  const source = { ast: { is: { IsFunctionExpression: node => node === declaration },
    name: node => node === declaration ? name : undefined },
    navigation: { declarationUses: node => {
      assert.equal(node === declaration, true, "exact named function declaration");
      return uses;
    } } };
  const evidence = { isCompileTimeMetadata: () => false };
  return { declaration, call, value, otherDeclaration, lexical, uses, source, evidence };
}

test("named self retains exact call/value identity and immutable closed selections", () => {
  const input = fixture();
  const issues = [];
  const selected = selectCsharpNamedSelfBinding(input.source, input.declaration, input.lexical, input.evidence, issues);
  assert.equal(issues.length, 0);
  assert.equal(selected?.declaration === input.declaration, true);
  assert.equal(selected?.calls.length, 1);
  assert.equal(selected?.calls[0] === input.call, true);
  assert.equal(selected?.values.length, 1);
  assert.equal(selected?.values[0] === input.value, true);
  assert.equal(selected?.captures, false);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.calls), true);
  assert.equal(Object.isFrozen(selected.values), true);
});

test("arrow, anonymous and unused named functions require no fixed-self owner", () => {
  const input = fixture();
  const issues = [];
  assert.equal(selectCsharpNamedSelfBinding(input.source, input.otherDeclaration, input.lexical, input.evidence, issues) === undefined, true);
  const anonymous = { ...input.source, ast: { ...input.source.ast, name: () => undefined } };
  assert.equal(selectCsharpNamedSelfBinding(anonymous, input.declaration, input.lexical, input.evidence, issues) === undefined, true);
  assert.equal(selectCsharpNamedSelfBinding(input.source, input.declaration, { ...input.lexical, selfReferences: [] }, input.evidence, issues) === undefined, true);
  assert.equal(issues.length, 0);
});

test("named-self capture selection excludes erased metadata but retains real receivers", () => {
  const input = fixture();
  const metadata = {};
  const lexical = { ...input.lexical, captures: [{ declaration: metadata, references: [] }] };
  const evidence = { isCompileTimeMetadata: node => node === metadata };
  const issues = [];
  const erased = selectCsharpNamedSelfBinding(input.source, input.declaration, lexical, evidence, issues);
  assert.equal(erased?.captures, false);
  const captured = selectCsharpNamedSelfBinding(input.source, input.declaration,
    { ...lexical, captures: [...lexical.captures, { declaration: input.otherDeclaration, references: [] }] }, evidence, issues);
  assert.equal(captured?.captures, true);
  const receiver = selectCsharpNamedSelfBinding(input.source, input.declaration,
    { ...input.lexical, receivers: [{ owner: input.otherDeclaration, references: [input.call] }] }, evidence, issues);
  assert.equal(receiver?.captures, true);
  assert.equal(issues.length, 0);
});

test("missing, writable and non-runtime self evidence fail closed without spelling matching", () => {
  for (const use of [undefined,
    { reference: {}, kind: "direct-call", role: "call-target" },
    { kind: "first-class", role: "write" },
    { kind: "source-linkage", role: "source-linkage" },
    { kind: "type-only", role: "type-only" }]) {
    const input = fixture();
    input.uses.splice(0, input.uses.length, ...(use === undefined ? [] : [{ reference: input.call, ...use }]));
    const issues = [];
    const selected = selectCsharpNamedSelfBinding(input.source, input.declaration,
      { ...input.lexical, selfReferences: [input.call] }, input.evidence, issues);
    assert.equal(selected === undefined, true, "unproven immutable self reference");
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.node === input.call, true);
    assert.equal(issues[0]?.code, "CSHARP_NAMED_SELF_NOT_CLOSED");
  }
});

test("an erased self reference does not require a runtime value or environment", () => {
  const input = fixture();
  const issues = [];
  const evidence = { isCompileTimeMetadata: () => true };
  assert.equal(selectCsharpNamedSelfBinding(input.source, input.declaration, input.lexical, evidence, issues) === undefined, true);
  assert.equal(issues.length, 0);
});
