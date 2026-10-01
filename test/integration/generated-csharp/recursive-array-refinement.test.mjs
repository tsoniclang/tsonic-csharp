import assert from "node:assert/strict";
import test from "node:test";
import { recursiveArrayRefinementSource, arrayRecordRefinementSource, multipleArrayRefinementSource,
  genericArrayRefinementFiles, conflictingArrayRefinementFiles } from "../../../../tsonic/test/fixtures/recursive-array-refinement.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("recursive array refinement preserves native members and mutable backing identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: recursiveArrayRefinementSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /\.ToArray\(|\.Select\(/u);
  executeCsharpConstruction(compiled, "recursive-array-refinement");
});

test("array and record narrowing retains the exact native member instead of matching its name", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: arrayRecordRefinementSource });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\.ToArray\(|\.Select\(/u);
  executeCsharpConstruction(compiled, "array-record-refinement");
});

test("multiple refined native arrays retain their exact element carriers and backing", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: multipleArrayRefinementSource });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\.ToArray\(|\.Select\(|IArrayLike<|dynamic|\.GetType\(/u);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /JSArray<[^>]*BigInteger/u);
  executeCsharpConstruction(compiled, "multiple-array-refinement");
});

test("cross-file generic array union aliases preserve exact native marker arguments", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: genericArrayRefinementFiles["index.ts"],
    files: Object.fromEntries(Object.entries(genericArrayRefinementFiles).filter(([path]) => path !== "index.ts")) });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /\.ToArray\(|\.Select\(|JSArray<[^>]*BigInteger/u);
  executeCsharpConstruction(compiled, "generic-array-refinement");
});

test("cross-file generic array union aliases reject conflicting native element widths", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: conflictingArrayRefinementFiles["index.ts"],
    files: Object.fromEntries(Object.entries(conflictingArrayRefinementFiles).filter(([path]) => path !== "index.ts")) });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.ok(compiled.targetDiagnostics.length > 0);
  assert.equal(compiled.result.artifacts.length, 0);
});
