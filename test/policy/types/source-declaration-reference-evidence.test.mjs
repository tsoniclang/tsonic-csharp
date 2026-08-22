import assert from "node:assert/strict";
import test from "node:test";

import {
  sourceDeclarationReferenceFactSubjects,
  sourceFactSubjectsForNode,
} from "../../../dist/policy/types/resolution/source-evidence.js";

test("source declaration evidence preserves declaration-only index selections", () => {
  const declaration = {};
  const node = {};
  const reference = Object.freeze({
    declaration,
    sourceFile: {},
    project: false,
  });
  const navigation = {
    sourceReferenceFor: (candidate) => candidate === node ? reference : undefined,
  };

  const selected = sourceDeclarationReferenceFactSubjects(reference);
  const forNode = sourceFactSubjectsForNode(node, navigation);

  assert.deepEqual(selected, [declaration]);
  assert.deepEqual(forNode, [node, declaration]);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(forNode), true);
});

test("source declaration evidence retains a supplied selected symbol", () => {
  const symbol = {};
  const declaration = {};
  const selected = sourceDeclarationReferenceFactSubjects({
    symbol,
    declaration,
    sourceFile: {},
    project: false,
  });

  assert.deepEqual(selected, [symbol, declaration]);
});
