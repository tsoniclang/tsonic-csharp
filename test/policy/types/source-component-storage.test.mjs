import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceTypeComponentEvidence } from "../../../dist/policy/types/resolution/source-profiles.js";

test("declared callable components select their own storage owner without inherited container projections", () => {
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
      assert.equal(selected.sourceValueSubject === owner, true, mode);
      assert.equal(selected.sourceValueProjection === undefined, true, mode);
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
