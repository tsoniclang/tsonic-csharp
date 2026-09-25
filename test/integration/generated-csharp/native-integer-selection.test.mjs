import assert from "node:assert/strict";
import test from "node:test";
import { nativeIntegerSelectionSource } from "../../../../tsonic/test/fixtures/native-integer-selection.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native counters, conditional joins and integer floor preserve exact carriers and fractional controls", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeIntegerSelectionSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  const counted = output.slice(output.indexOf("string counted("), output.indexOf("string growing("));
  assert.match(counted, /for \(int index = 0;/u);
  assert.doesNotMatch(counted, /double|Convert\.To/u);
  const floor = output.slice(output.indexOf("int integralFloor("), output.indexOf("double fractionalFloor("));
  assert.doesNotMatch(floor, /Math\.floor|double/u);
  executeCsharpConstruction(compiled, "native-integer-selection");
});
