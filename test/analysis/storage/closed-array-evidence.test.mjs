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

test("storage evidence publishes an index without the closed-array inspector", () => {
  const { result } = evidenceFor("export {};");
  assert.deepEqual(Object.keys(result).sort(), ["eraseCompileTimeDeclaration", "index", "inspectClosedArrayStorage", "nativeExpressionIssues", "sealCompileTimeDeclarations"]);
  assert.equal(result.nativeExpressionIssues.length, 0, "the valid open evidence result has no native key admission issue");
  assert.equal(Object.isFrozen(result.nativeExpressionIssues), true, "open admission issues are immutable data");
  assert.equal(Object.hasOwn(result.index, "nativeExpressionIssues"), false, "native admission issues are not a new published record family");
  assert.equal(Object.isFrozen(result) && Object.isFrozen(result.index), true);
  assert.equal(Object.hasOwn(result.index, "inspectClosedArrayStorage"), false, "the index has no executable source worklist");
  assert.equal(Object.hasOwn(result.index, "closedArrayStorage"), false);
  for (const name of ["eraseCompileTimeDeclaration", "sealCompileTimeDeclarations"]) {
    assert.equal(typeof result[name], "function", `${name}: private open builder capability`);
    assert.equal(Object.hasOwn(result.index, name), false, `${name}: the published readonly index contains no writer`);
  }
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

test("compile-time declaration writes and the private close boundary are exact", () => {
  const { result, source, sourceFiles } = evidenceFor("const value = 7; export {};");
  let declaration;
  const pending = [...sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    if (source.ast.is.IsVariableDeclaration(node)) declaration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  assert.equal(declaration !== undefined, true, "the writer consumes an actual checked declaration");
  assert.equal(result.index.compileTimeMetadata.get(declaration), false, "the primitive constant starts as normal native input");
  result.eraseCompileTimeDeclaration(declaration);
  assert.equal(result.index.compileTimeMetadata.get(declaration), true, "one existing metadata channel owns the erased declaration");
  result.sealCompileTimeDeclarations();
  assert.equal(result.index.compileTimeMetadata.get(declaration), true, "closing preserves exact readonly data");
  assert.throws(() => result.eraseCompileTimeDeclaration(declaration), /cannot change after native admission is sealed/u,
    "even an identical write is forbidden after the actual close");
  assert.throws(() => result.sealCompileTimeDeclarations(), /must be sealed exactly once/u,
    "the private builder has exactly one close boundary");
  for (const name of ["eraseCompileTimeDeclaration", "sealCompileTimeDeclarations"])
    assert.equal(Object.hasOwn(result.index, name), false, `${name}: no writer is added by closing`);
});
