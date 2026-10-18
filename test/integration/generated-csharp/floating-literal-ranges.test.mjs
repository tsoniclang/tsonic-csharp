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
  test(`${surface} authored native numeric tokens retain exact values, decimal scale and actual float64 casts`, { timeout: 300_000 }, () => {
    const sourceText = `import type { decimal, float32, float64 } from "@tsonic/core/types.js";
export function exact(): decimal { return 9007199254740993; }
export function whole(): decimal { return 1; }
export function scaled(): decimal { return 1.00; }
export function zero(): decimal { return 0.000; }
export function negativeZero(): decimal { return -0.000; }
export function exponent(): decimal { return 1.00e1; }
export function zeroExponent(): decimal { return 0.000e2; }
export function maximum(): decimal { return 79228162514264337593543950335.4; }
export function rounded(): decimal { return 1.00000000000000000000000000015; }
export function direct(): float32 { return 1.00000005960464477539062500000001; }
export function realDouble(): float32 {
  const value: float64 = 1.00000005960464477539062500000001;
  return value as float32;
}
export function actualDecimal(): decimal {
  const value: float64 = 9007199254740992;
  return value as decimal;
}
export function decimalCast(value: float64): decimal { return value as decimal; }
export function cast(value: float64): float32 { return value as float32; }
export function explicitLiteral(): float32 { return 1e40 as float32; }
export function explicitWrapped(): float32 { return (1e40) as float32; }
export function explicitNegativeWrapped(): float32 { return (-1e40) as float32; }
export function explicitWrappedMidpoint(): float32 { return (1.00000005960464477539062500000001) as float32; }
export function explicitNullableLiteral(): float32 | undefined { return 1e40 as float32 | undefined; }
export function explicitNullableMidpoint(): float32 | undefined { return (1.00000005960464477539062500000001) as float32 | undefined; }
export function explicitNullableAbsence(): float32 | undefined { return undefined; }
export function defaultFloat(value: float32 = -1.5): float32 { return value; }
export function readDefault(): float32 { return defaultFloat(); }
`;
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `exact-native-numeric-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
static int Flags(decimal value) => decimal.GetBits(value)[3];
if (Subject.exact() != 9007199254740993M || Subject.maximum() != decimal.MaxValue ||
    Subject.rounded() != 1.0000000000000000000000000002M)
    throw new System.Exception("exact native decimal value");
if (Flags(Subject.whole()) != 0 || Flags(Subject.scaled()) != 0x00020000 ||
    Flags(Subject.zero()) != 0x00030000 || Flags(Subject.negativeZero()) != unchecked((int)0x80030000) ||
    Flags(Subject.exponent()) != 0x00010000 || Flags(Subject.zeroExponent()) != 0x00010000)
    throw new System.Exception("authored decimal scale");
if (Subject.scaled().ToString(System.Globalization.CultureInfo.InvariantCulture) != "1.00" ||
    Subject.zeroExponent().ToString(System.Globalization.CultureInfo.InvariantCulture) != "0.0")
    throw new System.Exception("native decimal formatted scale");
if (System.BitConverter.SingleToUInt32Bits(Subject.direct()) != 0x3F800001 ||
    System.BitConverter.SingleToUInt32Bits(Subject.realDouble()) != 0x3F800000 ||
    System.BitConverter.SingleToUInt32Bits(Subject.cast(-0D)) != 0x80000000 ||
    !float.IsPositiveInfinity(Subject.cast(1e40D)) || !float.IsNegativeInfinity(Subject.cast(-1e40D)) ||
    !float.IsPositiveInfinity(Subject.explicitLiteral()) || !float.IsPositiveInfinity(Subject.explicitWrapped()) ||
    !float.IsNegativeInfinity(Subject.explicitNegativeWrapped()) ||
    System.BitConverter.SingleToUInt32Bits(Subject.explicitWrappedMidpoint()) != 0x3F800000 || Subject.readDefault() != -1.5F)
    throw new System.Exception("authored versus actual double native conversion");
var nullableLiteral = Subject.explicitNullableLiteral();
var nullableMidpoint = Subject.explicitNullableMidpoint();
if (!nullableLiteral.HasValue || !float.IsPositiveInfinity(nullableLiteral.Value) ||
    !nullableMidpoint.HasValue || System.BitConverter.SingleToUInt32Bits(nullableMidpoint.Value) != 0x3F800000 ||
    Subject.explicitNullableAbsence().HasValue)
    throw new System.Exception("explicit nullable float32 retains native double rounding and absence");
if (Subject.actualDecimal() != (decimal)9007199254740992D ||
    Subject.decimalCast(-0D) != (decimal)(-0D))
    throw new System.Exception("actual double to decimal is a native conversion, not token reinterpretation");
try { Subject.decimalCast(79228162514264337593543950336D); throw new System.Exception("native decimal overflow was lost"); }
catch (System.OverflowException) { }
System.Console.WriteLine("exact native numeric values and scale: correct");
`);
    assert.equal(output.trim(), "exact native numeric values and scale: correct");
  });

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
    assert.equal(generatedIndex(compiled).includes("return x < 1e+39D;"), true,
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
      "Half y = (Half)(-65504);",
      "Half y = (Half)(-0.0999755859375);",
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
