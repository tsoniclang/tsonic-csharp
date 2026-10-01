import assert from "node:assert/strict";
import test from "node:test";
import { recursiveArrayRefinementSource, arrayRecordRefinementSource } from "../../../../tsonic/test/fixtures/recursive-array-refinement.mjs";
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
