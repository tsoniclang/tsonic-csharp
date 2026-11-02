import { assertNumericLiteralRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { nativeIntegerSelectionSource } from "../../../../tsonic/test/fixtures/native-integer-selection.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native counters, conditional joins and integer floor preserve exact carriers and fractional controls", { timeout: 300_000 }, () => {
  assertNumericLiteralRefusal(compileCsharpSource({ surface: "js", sourceText: nativeIntegerSelectionSource }),
    [{ code: "CSHARP_UNSUPPORTED_AST", message: "No exact C# implicit conversion relates 'source:int64' to 'source:int32'.", text: "index" },
      numericCompoundRefusal("+=", "result += index / 2"), numericCompoundRefusal("+=", "index += 0.5")]);
  const typedSource = nativeIntegerSelectionSource
    .replace("for (let index = 0; index < bound", "for (let index: int32 = 0; index < bound")
    .replace("export function annotated(values: string[]): number {\n  let result = 0;", "export function annotated(values: string[]): number {\n  let result: number = 0;")
    .replace("export function fractional(values: string[]): number {\n  let result = 0;\n  for (let index = 0;", "export function fractional(values: string[]): number {\n  let result: number = 0;\n  for (let index: number = 0;")
    .replace("export function mutableCounter(values: string[]): number {\n  let result = 0;\n  for (let index = 0;", "export function mutableCounter(values: string[]): number {\n  let result: number = 0;\n  for (let index: number = 0;");
  const compiled = compileCsharpSource({ surface: "js", sourceText: typedSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  for (const name of ["integralFloor", "compoundFloor", "negatedFloor", "calledConditional", "calledConditionalLiteral", "conditional", "conditionalLiteral", "nested"]) {
    assert.match(output, new RegExp(`int ${name}\\(`, "u"), name);
  }
  assert.match(output, /long promoted\(/u);
  for (const name of ["optional", "optionalBranch"]) assert.match(output, new RegExp(`int\\? ${name}\\(`, "u"), name);
  for (const name of ["conditionalFraction", "explicitFloat", "fractionalFloor"]) assert.match(output, new RegExp(`double ${name}\\(`, "u"), name);
  const counted = output.slice(output.indexOf("string counted("), output.indexOf("string growing("));
  assert.equal(/\{\s*long index = 0L;\s*for \(; index < values\.length; index\+\+\)\s*\{\s*result \+= values\[index\];\s*\}\s*\}\s*return result;/u.test(counted),
    true, "the inferred int64 induction variable remains in its lexical stack scope with direct reads and increments");
  assert.doesNotMatch(counted, /double|Convert\.To/u);
  const floor = output.slice(output.indexOf("int integralFloor("), output.indexOf("double fractionalFloor("));
  assert.doesNotMatch(floor, /Math\.floor|double/u);
  executeCsharpConstruction(compiled, "native-integer-selection", false, false, [], `
using System;
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new Exception("original exact native integer and fractional contracts");
for (int index = 0; index < 1000; index++) {
    if (Index.forwardedCount(4) != 10 || Index.boundedCount(127) != 127) throw new Exception("native loop values");
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) {
    if (Index.forwardedCount(4) != 10 || Index.boundedCount(127) != 127) throw new Exception("native stack loop values");
}
if (GC.GetAllocatedBytesForCurrentThread() != before) throw new Exception("native loop stack scopes must not allocate");
`);
});
