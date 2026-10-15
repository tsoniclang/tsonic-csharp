import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
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
export function compareOverflow(x: float32): boolean {
  return x < 1e39;
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

const negativeHalfSource = `${header}
export function negativeHalf(): float16 {
  const y: float16 = -1.5;
  return y;
}
export function negativeLargestHalf(): float16 {
  const y: float16 = -65504;
  return y;
}
export function negativeRoundedHalf(): float16 {
  const y: float16 = -65519.99;
  return y;
}
export function negativeTenthHalf(): float16 {
  const y: float16 = -0.1;
  return y;
}
export function negativeZeroHalf(): float16 {
  const y: float16 = -0;
  return y;
}
export function negatedHalf(x: float32): float16 {
  return -x as float16;
}
export function signedHalves(): float16[] {
  const a: float16[] = [1.5, -1.5];
  return a;
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

function generatedIndex(compiled) {
  const index = [...compiled.artifacts].find(([path]) => path.endsWith("Index.cs"));
  assert.notEqual(index, undefined, "the compilation publishes Index.cs");
  return index[1];
}

function reportedNode(ast, sourceText, node) {
  if (node === undefined) return undefined;
  const pos = ast.pos(node);
  const end = ast.end(node);
  const raw = sourceText.slice(pos, end);
  const start = pos + raw.length - raw.trimStart().length;
  return { kind: ast.kindName(node), text: sourceText.slice(start, end), start, end };
}

for (const surface of ["native", "js"]) {
  test(`${surface} literals inside the float32, decimal and float16 ranges compile and keep the values C# and Half give them`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: acceptedSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `floating-literal-ranges-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (Subject.largestFloat() != float.MaxValue || Subject.thresholdFloat() != float.MaxValue ||
    Subject.negativeThresholdFloat() != -float.MaxValue || Subject.underflowFloat() != 0f || Subject.scaledFloat(2f) != 2e38f)
    throw new System.Exception("float32 boundary value");
if (!Subject.compareOverflow(float.MaxValue) || Subject.compareOverflow(float.PositiveInfinity) ||
    Subject.compareOverflow(float.NaN) || !Subject.compareOverflow(float.NegativeInfinity))
    throw new System.Exception("float32 comparison with a literal outside the float32 range");
if (Subject.belowMaximumDecimal() != 79228162514264330000000000000m || Subject.underflowDecimal() != 0m)
    throw new System.Exception("decimal boundary value");
if (Subject.largestHalf() != System.Half.MaxValue || Subject.roundedHalf() != System.Half.MaxValue || Subject.underflowHalf() != (System.Half)0)
    throw new System.Exception("float16 boundary value");
System.Console.WriteLine("floating literal ranges: correct");
`);
    assert.equal(output.trim(), "floating literal ranges: correct");
    assert.equal(generatedIndex(compiled).includes("return x < 1e+39;"), true,
      "a float32 operand compared with a literal outside the float32 range is compared as double");
  });

  test(`${surface} negative float16 literals and negated float16 conversions compile as casts of parenthesized values`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: negativeHalfSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `floating-literal-negative-half-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
static int Bits(System.Half value) => System.BitConverter.HalfToInt16Bits(value) & 0xFFFF;
if (Bits(Subject.negativeHalf()) != 0xBE00 || Bits(Subject.negativeLargestHalf()) != 0xFBFF ||
    Bits(Subject.negativeRoundedHalf()) != 0xFBFF || Bits(Subject.negativeTenthHalf()) != 0xAE66 ||
    Bits(Subject.negativeZeroHalf()) != 0x8000 || Bits(Subject.negatedHalf(1.5f)) != 0xBE00)
    throw new System.Exception("negative float16 value");
var halves = Subject.signedHalves();
if (halves.${surface === "js" ? "length" : "Length"} != 2 || Bits(halves[0]) != 0x3E00 || Bits(halves[1]) != 0xBE00)
    throw new System.Exception("signed float16 array element");
System.Console.WriteLine("negative float16 values: correct");
`);
    assert.equal(output.trim(), "negative float16 values: correct");
    const index = generatedIndex(compiled);
    assert.deepEqual([
      "Half y = (Half)(-1.5);",
      "Half y = (Half)(-65504);",
      "Half y = (Half)(-65519.99);",
      "Half y = (Half)(-0.1);",
      "Half y = (Half)(-0F);",
      "return (Half)(-x);",
      "(Half)1.5, (Half)(-1.5)",
    ].filter(line => !index.includes(line)), [], "each signed operand of a Half cast is printed in parentheses");
  });

  test(`${surface} literals outside the float32, decimal and float16 ranges are refused at the literal with no artifact`, { timeout: 300_000 }, () => {
    const outcomes = refused.map(([label, type, text]) => {
      const sourceText = `${header}export function f(): ${type} {\n  const y: ${type} = ${text};\n  return y;\n}\n`;
      const compiled = compileCsharpSource({ surface, sourceText });
      const ast = createTargetSourceProgram(compiled.source).ast;
      return {
        label,
        sourceDiagnostics: compiled.sourceDiagnosticsText,
        diagnostics: compiled.result.diagnostics.map(entry => ({
          code: entry.code,
          category: entry.category,
          message: entry.message,
          source: entry.source,
          node: reportedNode(ast, sourceText, entry.sourceNode),
        })),
        artifacts: compiled.artifacts.size,
      };
    });
    assert.deepEqual(outcomes, refused.map(([label, type, text]) => {
      const sourceText = `${header}export function f(): ${type} {\n  const y: ${type} = ${text};\n  return y;\n}\n`;
      const start = sourceText.indexOf(`= ${text};`) + 2;
      return {
        label,
        sourceDiagnostics: "",
        diagnostics: [{
          code: "CSHARP_UNSUPPORTED_AST",
          category: "error",
          message: `Source numeric literal is outside the '${type}' range.`,
          source: "tsonic-csharp",
          node: {
            kind: text.startsWith("-") ? "KindPrefixUnaryExpression" : "KindNumericLiteral",
            text,
            start,
            end: start + text.length,
          },
        }],
        artifacts: 0,
      };
    }), "each out-of-range literal is refused once, at the initializer expression itself, and publishes nothing");
  });
}
