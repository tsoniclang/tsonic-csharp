import assert from "node:assert/strict";
import test from "node:test";
import { resolveCallableEvidence, resolveSignatureParameterEvidence, resolveSourceProfileType, resolveSourceTypeComponentEvidence } from "../../../dist/policy/types/resolution/source-profiles.js";
import { csharpSourceStorageComponentContext } from "../../../dist/policy/types/resolution/source-storage-projection.js";

const typeOnlyPredicates = { IsTypeAliasDeclaration: () => false, IsInterfaceDeclaration: () => false,
  IsTypeParameterDeclaration: () => false };
const subject = (node, kind = "value", projection = []) => Object.freeze({ node, kind, projection: Object.freeze(projection) });

test("type transformations retain the selected value owner independently of metadata declarations", () => {
  for (const mode of ["parameter", "result", "unavailable"]) {
    const owner = { kind: mode };
    const imported = subject({ kind: "import" }, "member", [{ kind: "array-element" }, { kind: "tuple-element", index: 0 }]);
    const syntax = {};
    const type = {};
    const file = {};
    const bindings = new Map([[{}, { sourceType: {}, targetType: { kind: "source-primitive", name: "int64" } }]]);
    const state = { depth: 4, sourceStorageSubject: imported, sourceBindings: bindings };
    const expected = mode === "unavailable" ? undefined : { kind: "source-primitive", name: "int64" };
    let selections = 0;
    const assertOwner = selected => {
      assert.equal(selected.sourceStorageSubject === imported, true, mode);
      assert.equal(selected.sourceStorageSubject.projection === imported.projection, true, mode);
      assert.equal(selected.sourceBindings === bindings, true, mode);
    };
    const result = resolveSourceTypeComponentEvidence({
      host: { ast: { getSourceFile: () => file, is: typeOnlyPredicates } },
      resolvePointerReturn(declaration, selected) {
        assert.equal(declaration === owner, true, mode);
        assertOwner(selected);
        assert.equal(selected.depth, 4, mode);
        return undefined;
      },
      resolveAuthoredAndSelectedSourceType(authored, authoredFile, selectedType, selectedFile, selected) {
        selections += 1;
        assert.equal(authored === syntax && authoredFile === file, true, mode);
        assert.equal(selectedType === type && selectedFile === file, true, mode);
        assertOwner(selected);
        assert.equal(selected.depth, 5, mode);
        return expected;
      },
    }, { declaration: owner, authoredTypeNode: syntax, selectedType: type }, { sourceFile: file }, state);
    assert.equal(result === expected, true, mode);
    assert.equal(selections, 1, mode);
    assert.equal(state.sourceStorageSubject === imported && imported.projection.length === 2, true, mode);
  }
});

test("callable parameters establish their exact entry input while tuple transformations retain theirs", () => {
  const owner = {};
  const input = subject(owner, "input");
  const imported = subject({}, "member", [{ kind: "tuple-element", index: 0 }]);
  const type = {};
  const file = {};
  const syntax = {};
  const carrier = { kind: "source-primitive", name: "int64" };
  const state = { depth: 2, sourceStorageSubject: imported };
  for (const use of ["callable", "parameter-list"]) {
    const resolved = resolveSignatureParameterEvidence({
      host: { ast: { typeNode: () => syntax }, sourceStorage: { subject(node, kind) {
        assert.equal(node === owner && kind === "input", true, "signature entry is not a mutable binding or physical member");
        return { kind: "resolved", subject: input };
      } } },
      resolveSourceTypeComponentEvidence(component, queries, selected) {
        assert.equal(component.declaration === owner && component.selectedType === type && component.authoredTypeNode === syntax, true);
        assert.equal(queries.sourceFile === file, true);
        assert.equal(selected.sourceStorageSubject === (use === "callable" ? input : imported), true, use);
        return carrier;
      },
    }, { declaration: owner, type, parameterKind: "required", omissionKind: "none" }, { sourceFile: file }, state, use);
    assert.equal(resolved === carrier, true, use);
  }
});

test("recognized Error profiles reject unavailable checked storage instead of manufacturing an object shape", () => {
  const file = {};
  const owner = subject({}, "input");
  let queries = 0;
  const scope = { host: { ast: { getSourceFile(node) { assert.equal(node === owner.node, true); return file; }, parent: () => undefined,
    is: { IsExpressionWithTypeArguments: () => false } }, hasSemantics: () => true,
    errorStorageDemands: { storageFor(selected) { queries += 1; assert.equal(selected === owner, true);
      return { kind: "unresolved", reason: "exact storage unavailable" }; } } } };
  const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
  assert.equal(resolveSourceProfileType(scope, identity, [], owner) === undefined, true);
  assert.equal(queries, 1);
  scope.host.hasSemantics = () => false;
  assert.equal(resolveSourceProfileType(scope, identity, [], owner)?.id, "System.Exception");
  assert.equal(queries, 1, "provider signature evidence is not a checked runtime storage subject");
});

test("callable results establish their own storage owner rather than retaining the enclosing delegate owner", () => {
  const owner = {};
  const resultSubject = subject(owner, "return");
  const file = {};
  const bindings = new Map();
  const enclosing = subject({}, "input", [{ kind: "array-element" }]);
  const state = { depth: 2, sourceStorageSubject: enclosing,
    sourceBindings: bindings };
  const carrier = { kind: "target-named", id: "System.String" };
  const callable = { parameters: [], result: { declaration: owner, selectedType: {} } };
  const resolved = resolveCallableEvidence({
    host: { ast: { typeParameters: node => { assert.equal(node === owner, true); return []; }, is: typeOnlyPredicates },
      sourceStorage: { subject(node, kind) { assert.equal(node === owner && kind === "return", true);
        return { kind: "resolved", subject: resultSubject }; } } },
    resolveSignatureParameterEvidence() { assert.fail("the callable has no parameters"); },
    resolveSourceTypeComponentEvidence(component, queries, selected) {
      assert.equal(component === callable.result && queries.sourceFile === file, true);
      assert.equal(selected.sourceStorageSubject === resultSubject, true);
      assert.equal(selected.sourceBindings === bindings && selected.depth === state.depth, true);
      return carrier;
    },
  }, callable, { sourceFile: file }, state);
  assert.equal(resolved !== undefined, true);
  assert.equal(enclosing.projection.length, 1, "the enclosing owner's state is never mutated");
});

test("declaration-free transformations retain the current exact storage component", () => {
  const owner = subject({}, "member", [{ kind: "array-element" }, { kind: "tuple-element", index: 1 }]);
  const type = {};
  const file = {};
  const state = { depth: 2, sourceStorageSubject: owner };
  const carrier = { kind: "source-primitive", name: "uint64" };
  const result = resolveSourceTypeComponentEvidence({
    host: { ast: { is: typeOnlyPredicates } },
    resolvePointerReturn() { assert.fail("a declaration-free transformation has no new pointer return owner"); },
    resolveTypeWithState(selectedType, selectedFile, selected) {
      assert.equal(selectedType === type && selectedFile === file, true);
      assert.equal(selected.sourceStorageSubject === owner, true);
      assert.equal(selected.depth, 3);
      return carrier;
    },
  }, { selectedType: type }, { sourceFile: file }, state);
  assert.equal(result === carrier, true);
});

test("component context preserves each exact source role through only the owning subject interner", () => {
  for (const kind of ["input", "value", "member", "return", "receiver"]) {
    const owner = subject({}, kind, [{ kind: "array-element" }]);
    const component = { kind: "tuple-element", index: 1 };
    const projected = subject(owner.node, kind, [...owner.projection, component]);
    let calls = 0;
    const host = { sourceStorage: { subject(node, selectedKind, projection) {
      calls += 1;
      assert.equal(node === owner.node && selectedKind === owner.kind, true, kind);
      assert.deepEqual(projection, projected.projection);
      return { kind: "resolved", subject: projected };
    } } };
    const state = { depth: 2, sourceStorageSubject: owner };
    assert.equal(csharpSourceStorageComponentContext(host, state, component).sourceStorageSubject === projected, true, kind);
    assert.equal(state.sourceStorageSubject === owner && owner.projection.length === 1, true, kind);
    assert.equal(calls, 1, kind);
  }
});
