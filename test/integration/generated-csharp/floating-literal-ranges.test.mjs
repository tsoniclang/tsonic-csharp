import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const header = `import type { decimal, float16, float32 } from "@tsonic/core/types.js";\n`;
const acceptedSource = `${header}
export function largestFloat(): float32 {
  const y: float32 = 3.4028234663852886e38;
  return y;
}
export function thresholdFloat(): float32 {
  const y: float32 = 3.4028235677973366e38;
  return y;
}
export function negativeThresholdFloat(): float32 {
  const y: float32 = -3.4028235677973366e38;
  return y;
}
export function underflowFloat(): float32 {
  const y: float32 = 1e-50;
  return y;
}
export function scaledFloat(x: float32): float32 {
  return x * 1e38;
}
export function belowMaximumDecimal(): decimal {
  const y: decimal = 7.922816251426433e28;
  return y;
}
export function underflowDecimal(): decimal {
  const y: decimal = 1e-29;
  return y;
}
export function largestHalf(): float16 {
  const y: float16 = 65504;
  return y;
}
export function roundedHalf(): float16 {
  const y: float16 = 65519.99;
  return y;
}
export function underflowHalf(): float16 {
  const y: float16 = 1e-10;
  return y;
}
`;

const refused = [
  ["float32 above the overflow threshold", "float32", "3.402823567797337e38"],
  ["float32 1e39", "float32", "1e39"],
  ["float32 -1e39", "float32", "-1e39"],
  ["decimal 2^96", "decimal", "79228162514264337593543950336"],
  ["decimal 1e300", "decimal", "1e300"],
  ["float16 65520", "float16", "65520"],
  ["float16 -1e5", "float16", "-1e5"],
];

for (const surface of ["native", "js"]) {
  test(`${surface} literals inside the float32, decimal and float16 ranges compile and keep the values C# and Half give them`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: acceptedSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `floating-literal-ranges-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (Subject.largestFloat() != float.MaxValue || Subject.thresholdFloat() != float.MaxValue ||
    Subject.negativeThresholdFloat() != -float.MaxValue || Subject.underflowFloat() != 0f || Subject.scaledFloat(2f) != 2e38f)
    throw new System.Exception("float32 boundary value");
if (Subject.belowMaximumDecimal() != 79228162514264330000000000000m || Subject.underflowDecimal() != 0m)
    throw new System.Exception("decimal boundary value");
if (Subject.largestHalf() != System.Half.MaxValue || Subject.roundedHalf() != System.Half.MaxValue || Subject.underflowHalf() != (System.Half)0)
    throw new System.Exception("float16 boundary value");
System.Console.WriteLine("floating literal ranges: correct");
`);
    assert.equal(output.trim(), "floating literal ranges: correct");
  });

  test(`${surface} literals outside the float32, decimal and float16 ranges are refused with no artifact`, { timeout: 300_000 }, () => {
    const outcomes = refused.map(([label, type, text]) => {
      const compiled = compileCsharpSource({ surface, sourceText: `${header}export function f(): ${type} {\n  const y: ${type} = ${text};\n  return y;\n}\n` });
      return {
        label,
        sourceDiagnostics: compiled.sourceDiagnosticsText,
        diagnostics: compiled.result.diagnostics.map(entry => ({ code: entry.code, message: entry.message })),
        artifacts: compiled.artifacts.size,
      };
    });
    assert.deepEqual(outcomes, refused.map(([label, type]) => ({
      label,
      sourceDiagnostics: "",
      diagnostics: [{ code: "CSHARP_UNSUPPORTED_AST", message: `Source numeric literal is outside the '${type}' range.` }],
      artifacts: 0,
    })), "each out-of-range literal is refused with the range diagnostic and publishes nothing");
  });
}
