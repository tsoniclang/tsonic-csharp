import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpSourceEvidenceBuilder } from "../../../dist/analysis/source-evidence/analyze.js";

function evidenceFor(sourceText) {
  const checked = analyzeCsharpSource({ sourceText, surface: "native" });
  assertCsharpCheckingSucceeded(checked);
  assert.equal(checked.analysis.kind, "resolved", "the normal checked program supplies actual Native evidence production");
  const program = checked.analysis.value;
  const policy = program.analysis.policy;
  return { source: program.source, policy, sourceFiles: program.sourceFiles,
    builder: createCsharpSourceEvidenceBuilder(policy) };
}

test("storage evidence publishes an index without the closed-array inspector", () => {
  const { builder } = evidenceFor("export {};");
  const expected = ["nativeExpressionIssues", "value", "declaration", "parameter", "argument", "enumMember",
    "generator", "callableReturn", "yielded", "returned", "propertyName", "metadata", "compileTimeExpression",
    "closedArray", "pointerBacking", "eraseCompileTimeDeclaration", "seal"];
  assert.deepEqual(Object.keys(builder).sort(), expected.sort(), "the complete current production API, not a truncated inventory");
  assert.equal(builder.nativeExpressionIssues.length, 0, "the valid open owner has no Native key admission issue");
  assert.equal(Object.isFrozen(builder.nativeExpressionIssues), true, "open admission diagnostics are immutable data");
  const index = builder.seal();
  assert.equal(Object.hasOwn(index, "nativeExpressionIssues"), false, "admission diagnostics are not a new published record family");
  assert.equal(Object.isFrozen(builder) && Object.isFrozen(index), true);
  for (const name of ["closedArray", "inspectClosedArrayStorage", "eraseCompileTimeDeclaration", "seal", "sealCompileTimeDeclarations"]) {
    assert.equal(Object.hasOwn(index, name), false, name + ": sealed data contains no inspector or writer");
  }
  for (const [name, member] of Object.entries(index)) {
    assert.equal(typeof member !== "function", true, name + ": members are data or frozen lookup readers");
  }
});

test("the closed-array inspector stays available to native backing through the open evidence owner", () => {
  const { builder, policy, sourceFiles } = evidenceFor("export {};");
  assert.equal(sourceFiles.length, 1, "the complete original project file domain");
  assert.equal(typeof builder.closedArray, "function");
  const bindings = policy.sourceStorage.bindingsForLexicalOwner(sourceFiles[0]);
  assert.equal(bindings.kind, "resolved", "the real scope owns the inspection environment");
  const expected = policy.sourceStorage.memory.closedArrayStorage.resolve(sourceFiles[0], bindings.bindings);
  const inspected = builder.closedArray(sourceFiles[0], bindings.bindings);
  assert.equal(inspected.kind, expected.kind, "the private receiving retains the canonical Source outcome");
  assert.equal(inspected.kind, "resolved", "a non-element original has an actual completed unproven classification");
  assert.equal(inspected.value.kind, "unproven");
  assert.equal(inspected.value.reason, expected.value.reason, "no second closed-array classifier or guessed environment");
  builder.seal();
  assert.throws(() => builder.closedArray(sourceFiles[0], bindings.bindings), /after sealing/u);
});

test("compile-time declaration writes and the private close boundary are exact", () => {
  const { builder, policy, source, sourceFiles } = evidenceFor("const value = 7; export {};");
  const declarations = source.facts.navigation.nodesForFiles(sourceFiles).filter(node => source.ast.is.IsVariableDeclaration(node));
  assert.equal(declarations.length, 1, "the complete original declaration domain");
  const declaration = declarations[0];
  const before = createCsharpSourceEvidenceBuilder(policy).seal();
  assert.equal(before.compileTimeMetadata.get(declaration), false, "the original primitive constant starts as normal Native input");
  assert.throws(() => builder.eraseCompileTimeDeclaration(declaration), /completed admitted storage record/u,
    "an uncompleted declaration cannot be erased before physical admission");
  assert.equal(builder.declaration(declaration).kind, "represented", "the actual declaration storage owner completes first");
  builder.eraseCompileTimeDeclaration(declaration);
  const index = builder.seal();
  assert.equal(index.compileTimeMetadata.get(declaration), true, "the same metadata channel retains the exact erased declaration");
  assert.equal(before.compileTimeMetadata.get(declaration), false, "sealing copied data rather than a live mutable builder view");
  assert.throws(() => builder.eraseCompileTimeDeclaration(declaration), /after sealing/u,
    "even an identical write is forbidden after the actual close");
  assert.throws(() => builder.seal(), /after sealing/u, "the private owner has exactly one close boundary");
  for (const name of ["eraseCompileTimeDeclaration", "seal"])
    assert.equal(Object.hasOwn(index, name), false, name + ": closing never adds a writer");
});
