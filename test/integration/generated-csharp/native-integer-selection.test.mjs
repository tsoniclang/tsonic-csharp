import assert from "node:assert/strict";
import test from "node:test";
import { nativeIntegerSelectionSource } from "../../../../tsonic/test/fixtures/native-integer-selection.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native counters, conditional joins and integer floor preserve exact carriers and fractional controls", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeIntegerSelectionSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  for (const name of ["integralFloor", "compoundFloor", "negatedFloor", "calledConditional", "calledConditionalLiteral", "conditional", "conditionalLiteral", "nested"]) {
    assert.match(output, new RegExp(`int ${name}\\(`, "u"), name);
  }
  assert.match(output, /long promoted\(/u);
  for (const name of ["optional", "optionalBranch"]) assert.match(output, new RegExp(`int\\? ${name}\\(`, "u"), name);
  for (const name of ["conditionalFraction", "explicitFloat", "fractionalFloor"]) assert.match(output, new RegExp(`double ${name}\\(`, "u"), name);
  const counted = output.slice(output.indexOf("string counted("), output.indexOf("string growing("));
  assert.match(counted, /for \(int index = 0;/u);
  assert.doesNotMatch(counted, /double|Convert\.To/u);
  const floor = output.slice(output.indexOf("int integralFloor("), output.indexOf("double fractionalFloor("));
  assert.doesNotMatch(floor, /Math\.floor|double/u);
  executeCsharpConstruction(compiled, "native-integer-selection");
});
