import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
import type { decimal, float16, float32 } from "@tsonic/core/types.js";
function identity(value: float32): float32 {
  return value;
}
export function local(x: float32): float32 {
  const y: float32 = -x;
  return y;
}
export function returned(x: float32): float32 {
  return -x;
}
export function argument(x: float32): float32 {
  return identity(-x);
}
export function assigned(x: float32): float32 {
  let y: float32 = x;
  y = -x;
  return y;
}
export function positive(x: float32): float32 {
  const y: float32 = +x;
  return y;
}
export function twice(x: float32): float32 {
  const y: float32 = -(-x);
  return y;
}
export function grouped(x: float32): float32 {
  const y: float32 = -(x);
  return y;
}
export function half(x: float16): float16 {
  const y: float16 = -x;
  return y;
}
export function money(x: decimal): decimal {
  const y: decimal = -x;
  return y;
}
export function literal(): float32 {
  const y: float32 = -1.5;
  return y;
}
`;

for (const surface of ["native", "js"]) {
  test(`${surface} signed float32, float16 and decimal operands negate natively without a literal conversion`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const text = compiled.artifacts.get("src/Index.cs");
    for (const line of ["float y = -x;", "return -x;", "return global::Tsonic.Generated.Index.identity(-x);", "y = -x;",
      "float y = +x;", "float y = -(-x);", "float y = -(x);", "Half y = -x;", "decimal y = -x;", "float y = -1.5F;"]) {
      assert.equal(text.split("\n").some((candidate) => candidate.trim() === line), true, `generated line: ${line}`);
    }
    const output = executeCsharpConstruction(compiled, `negated-numeric-operands-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
foreach (float x in new[] { 1.5f, -2.25f, 0.0f, -0.0f, float.MaxValue, float.PositiveInfinity })
{
    if (Subject.local(x) != -x || Subject.returned(x) != -x || Subject.argument(x) != -x || Subject.assigned(x) != -x ||
        Subject.grouped(x) != -x || Subject.positive(x) != x || Subject.twice(x) != x)
        throw new System.Exception("float32 negation value");
    if (float.IsNegative(Subject.local(x)) == float.IsNegative(x) || float.IsNegative(Subject.twice(x)) != float.IsNegative(x))
        throw new System.Exception("float32 negation sign");
}
if (!float.IsNaN(Subject.local(float.NaN)) || Subject.literal() != -1.5f)
    throw new System.Exception("float32 NaN or literal value");
if (Subject.half((System.Half)1.5f) != (System.Half)(-1.5f) || Subject.money(1.5m) != -1.5m)
    throw new System.Exception("float16 or decimal negation value");
System.Console.WriteLine("signed operands: correct");
`);
    assert.equal(output.trim(), "signed operands: correct");
  });
}
