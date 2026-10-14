import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpSourceEvidence } from "../../../dist/analysis/source-evidence/analyze.js";

const unknownTypes = new Proxy({}, { get: () => () => undefined });

function evidenceFor(sourceText) {
  const checked = checkCsharpSource({ sourceText, surface: "native" });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const sourceFiles = Object.freeze([...source.navigation.sourceFiles]);
  return { source, sourceFiles, result: analyzeCsharpSourceEvidence(source, sourceFiles, unknownTypes, { types: unknownTypes }) };
}

test("source evidence publishes an index without the closed-array inspector", () => {
  const { result } = evidenceFor("export {};");
  assert.deepEqual(Object.keys(result).sort(), ["index", "inspectClosedArrayStorage"]);
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.index), true);
  assert.equal(Object.hasOwn(result.index, "inspectClosedArrayStorage"), false, "the index has no executable source worklist");
  assert.equal(Object.hasOwn(result.index, "closedArrayStorage"), false);
  for (const [name, member] of Object.entries(result.index)) {
    assert.equal(typeof member !== "function", true, `${name}: index members are data or frozen readers`);
  }
});

test("the closed-array inspector stays available to native backing through the evidence result", () => {
  const { result, sourceFiles } = evidenceFor("export {};");
  assert.equal(typeof result.inspectClosedArrayStorage, "function");
  const inspected = result.inspectClosedArrayStorage(sourceFiles[0]);
  assert.equal(typeof inspected?.kind, "string", "the private inspector still answers closed-array questions");
});
