import assert from "node:assert/strict";
import test from "node:test";
import { resolveCallableEvidence, resolveSignatureParameterEvidence, resolveSourceProfileType, resolveSourceTypeComponentEvidence } from "../../../dist/policy/types/resolution/source-profiles.js";

test("type transformations retain the selected value owner independently of metadata declarations", () => {
  for (const mode of ["parameter", "result", "unavailable"]) {
    const owner = { kind: mode };
    const imported = { kind: "import" };
    const syntax = {};
    const type = {};
    const file = {};
    const bindings = new Map([[{}, { sourceType: {}, targetType: { kind: "source-primitive", name: "int64" } }]]);
    const state = { depth: 4, sourceValueSubject: imported,
      sourceValueProjection: [{ kind: "array-element" }, { kind: "tuple-element", index: 0 }],
      sourceBindings: bindings };
    const expected = mode === "unavailable" ? undefined : { kind: "source-primitive", name: "int64" };
    let selections = 0;
    const assertOwner = selected => {
      assert.equal(selected.sourceValueSubject === imported, true, mode);
      assert.equal(selected.sourceValueProjection === state.sourceValueProjection, true, mode);
      assert.equal(selected.sourceBindings === bindings, true, mode);
    };
    const result = resolveSourceTypeComponentEvidence({
      host: { ast: { getSourceFile: () => file } },
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
    assert.equal(state.sourceValueSubject === imported && state.sourceValueProjection.length === 2, true, mode);
  }
});

test("callable parameters establish their exact storage owner while tuple transformations retain theirs", () => {
  const owner = {};
  const imported = {};
  const type = {};
  const file = {};
  const syntax = {};
  const carrier = { kind: "source-primitive", name: "int64" };
  const state = { depth: 2, sourceValueSubject: imported, sourceValueProjection: [{ kind: "tuple-element", index: 0 }] };
  for (const use of ["callable", "parameter-list"]) {
    const resolved = resolveSignatureParameterEvidence({
      host: { ast: { typeNode: () => syntax } },
      resolveSourceTypeComponentEvidence(component, queries, selected) {
        assert.equal(component.declaration === owner && component.selectedType === type && component.authoredTypeNode === syntax, true);
        assert.equal(queries.sourceFile === file, true);
        assert.equal(selected.sourceValueSubject === (use === "callable" ? owner : imported), true, use);
        assert.equal(selected.sourceValueProjection === (use === "callable" ? undefined : state.sourceValueProjection), true, use);
        return carrier;
      },
    }, { declaration: owner, type, parameterKind: "required", omissionKind: "none" }, { sourceFile: file }, state, use);
    assert.equal(resolved === carrier, true, use);
  }
});

test("recognized Error profiles reject unavailable checked storage instead of manufacturing an object shape", () => {
  const file = {};
  const subject = {};
  let queries = 0;
  const scope = { host: { ast: { getSourceFile: () => file, parent: () => undefined,
    is: { IsExpressionWithTypeArguments: () => false } }, hasSemantics: () => true,
    errorStorageDemands: { storageFor(selected) { queries += 1; assert.equal(selected === subject, true);
      return { kind: "unresolved", reason: "exact storage unavailable" }; } } } };
  const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
  assert.equal(resolveSourceProfileType(scope, identity, [], subject) === undefined, true);
  assert.equal(queries, 1);
  scope.host.hasSemantics = () => false;
  assert.equal(resolveSourceProfileType(scope, identity, [], subject)?.id, "System.Exception");
  assert.equal(queries, 1, "provider signature evidence is not a checked runtime storage subject");
});

test("callable results establish their own storage owner rather than retaining the enclosing delegate owner", () => {
  const owner = {};
  const file = {};
  const bindings = new Map();
  const state = { depth: 2, sourceValueSubject: {}, sourceValueProjection: [{ kind: "array-element" }],
    sourceBindings: bindings };
  const carrier = { kind: "target-named", id: "System.String" };
  const callable = { parameters: [], result: { declaration: owner, selectedType: {} } };
  const resolved = resolveCallableEvidence({
    host: { ast: { typeParameters: node => { assert.equal(node === owner, true); return []; } } },
    resolveSignatureParameterEvidence() { assert.fail("the callable has no parameters"); },
    resolveSourceTypeComponentEvidence(component, queries, selected) {
      assert.equal(component === callable.result && queries.sourceFile === file, true);
      assert.equal(selected.sourceValueSubject === owner && selected.sourceValueProjection === undefined, true);
      assert.equal(selected.sourceBindings === bindings && selected.depth === state.depth, true);
      return carrier;
    },
  }, callable, { sourceFile: file }, state);
  assert.equal(resolved !== undefined, true);
  assert.equal(state.sourceValueProjection.length, 1, "the enclosing owner's state is never mutated");
});

test("declaration-free transformations retain the current exact storage component", () => {
  const owner = {};
  const type = {};
  const file = {};
  const projections = [{ kind: "array-element" }, { kind: "tuple-element", index: 1 }];
  const state = { depth: 2, sourceValueSubject: owner, sourceValueProjection: projections };
  const carrier = { kind: "source-primitive", name: "uint64" };
  const result = resolveSourceTypeComponentEvidence({
    host: { ast: {} },
    resolvePointerReturn() { assert.fail("a declaration-free transformation has no new pointer return owner"); },
    resolveTypeWithState(selectedType, selectedFile, selected) {
      assert.equal(selectedType === type && selectedFile === file, true);
      assert.equal(selected.sourceValueSubject === owner && selected.sourceValueProjection === projections, true);
      assert.equal(selected.depth, 3);
      return carrier;
    },
  }, { selectedType: type }, { sourceFile: file }, state);
  assert.equal(result === carrier, true);
});
