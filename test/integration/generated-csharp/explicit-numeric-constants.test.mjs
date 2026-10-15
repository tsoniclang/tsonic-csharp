import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const header = `import type { decimal, float32, int8, int32, nativeInt, uint8, uint32 } from "@tsonic/core/types.js";\n`;
const acceptedSource = `${header}
export function largestUint32(): uint32 {
  return 4294967295 as uint32;
}
export function negativeHalfUint32(): uint32 {
  return -0.5 as uint32;
}
export function truncatedUint8(): uint8 {
  return 255.9 as uint8;
}
export function truncatedInt8(): int8 {
  return -128.9 as int8;
}
export function roundedFloatUint32(): uint32 {
  return (4294967040 as float32) as uint32;
}
export function truncatedInt32(): int32 {
  return 2147483647.5 as int32;
}
export function negativeInt32(): int32 {
  return -1.5 as int32;
}
export function decimalNegativeHalfUint32(): uint32 {
  return (-0.5 as decimal) as uint32;
}
export function floatNegativeHalfUint32(): uint32 {
  return (-0.5 as float32) as uint32;
}
export function belowMaximumDecimal(): decimal {
  return 7.922816251426433e28 as decimal;
}
`;

const negatedLiteralSource = `
function identity(v: number): number {
  return v;
}
export function hugeNegative(): number {
  const y: number = -9223372036854777856;
  return y;
}
export function twoPow63Negative(): number {
  const y: number = -9223372036854775808;
  return y;
}
export function hugeNegativeReturn(): number {
  return -9.3e18;
}
export function hugeNegativeProduct(x: number): number {
  return x * -1e19;
}
export function hugeNegativeArgument(): number {
  return identity(-1e19);
}
`;

const refused = [
  ["uint32", "-1", "uint32"],
  ["uint32", "-1.5", "uint32"],
  ["uint8", "256", "uint8"],
  ["int32", "2147483648", "int32"],
  ["uint32 | undefined", "-1", "uint32"],
  ["uint32", "((-1))", "uint32"],
  ["uint32", "(-1 satisfies number)", "uint32"],
  ["uint32", "(0 - 1)", "uint32"],
  ["uint32", "(4294967295 as float32)", "uint32"],
  ["int32", "(1e39 as float32)", "int32"],
  ["uint32", "(-1 as nativeInt)", "uint32"],
  ["uint32", "(-1 as decimal)", "uint32"],
  ["int32", "(2147483647.9999998 as decimal)", "int32"],
  ["decimal", "7.922816251426434e28", "decimal"],
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

const refusedSource = (type, operand) => `${header}export function f(): ${type} {\n  return ${operand} as ${type};\n}\n`;

for (const surface of ["native", "js"]) {
  test(`${surface} explicit conversions of constants inside the C# target range compile and keep the values C# gives them`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: acceptedSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `explicit-numeric-constants-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (Subject.largestUint32() != 4294967295u || Subject.negativeHalfUint32() != 0u || Subject.truncatedUint8() != 255 ||
    Subject.truncatedInt8() != -128 || Subject.roundedFloatUint32() != 4294967040u || Subject.truncatedInt32() != 2147483647 ||
    Subject.negativeInt32() != -1 || Subject.decimalNegativeHalfUint32() != 0u || Subject.floatNegativeHalfUint32() != 0u)
    throw new System.Exception("explicit integral constant conversion");
if (Subject.belowMaximumDecimal() != 79228162514264300000000000000m)
    throw new System.Exception("explicit decimal constant conversion");
System.Console.WriteLine("explicit numeric constants: correct");
`);
    assert.equal(output.trim(), "explicit numeric constants: correct");
  });

  test(`${surface} negated float64 literals in the unsigned long range compile as double literals`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: negatedLiteralSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `negated-unsigned-long-literals-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (Subject.hugeNegative() != -9223372036854777856.0 || Subject.twoPow63Negative() != -9223372036854775808.0 ||
    Subject.hugeNegativeReturn() != -9.3e18 || Subject.hugeNegativeProduct(2.0) != -2e19 || Subject.hugeNegativeArgument() != -1e19)
    throw new System.Exception("negated float64 literal");
System.Console.WriteLine("negated float64 literals: correct");
`);
    assert.equal(output.trim(), "negated float64 literals: correct");
    const index = generatedIndex(compiled);
    assert.deepEqual([
      "double y = -9223372036854778000D;",
      "double y = -9223372036854776000D;",
      "return -9300000000000000000D;",
      "return x * -10000000000000000000D;",
      "(-10000000000000000000D)",
    ].filter(line => !index.includes(line)), [], "each negated literal in the unsigned long range is printed as a double literal");
  });

  test(`${surface} explicit conversions of constants outside the C# target range are refused at the converted operand with no artifact`, { timeout: 300_000 }, () => {
    const outcomes = refused.map(([type, operand]) => {
      const sourceText = refusedSource(type, operand);
      const compiled = compileCsharpSource({ surface, sourceText });
      const ast = createTargetSourceProgram(compiled.source).ast;
      return {
        operand,
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
    assert.deepEqual(outcomes, refused.map(([type, operand, range]) => {
      const start = refusedSource(type, operand).indexOf(`return ${operand} as`) + "return ".length;
      return {
        operand,
        sourceDiagnostics: "",
        diagnostics: [{
          code: "CSHARP_UNSUPPORTED_AST",
          category: "error",
          message: `Source numeric literal is outside the '${range}' range.`,
          source: "tsonic-csharp",
          node: {
            kind: operand.startsWith("(") ? "KindParenthesizedExpression" : operand.startsWith("-") ? "KindPrefixUnaryExpression" : "KindNumericLiteral",
            text: operand,
            start,
            end: start + operand.length,
          },
        }],
        artifacts: 0,
      };
    }), "each constant outside the target range is refused once, at the converted operand, and publishes nothing");
  });
}
