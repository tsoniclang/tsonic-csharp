import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const header = `import type { decimal, float32, int8, int32, uint8, uint32 } from "@tsonic/core/types.js";\n`;
const local = (name, type, expression) => `export function ${name}(): ${type} {\n  const y: ${type} = ${expression};\n  return y;\n}\n`;
const returned = (name, type, expression) => `export function ${name}(): ${type} {\n  return ${expression};\n}\n`;

const divisionFunctions = {
  native: [local("half", "number", "1 / 2")],
  js: [local("half", "number", "1 / 2"), local("nestedQuotient", "number", "(1 + 2) / 4")],
};
const divisionChecks = {
  native: "Subject.half() != 0.5",
  js: "Subject.half() != 0.5 || Subject.nestedQuotient() != 0.75",
};
const divisionLines = {
  native: ["double y = 1D / 2;"],
  js: ["double y = 1D / 2;", "double y = (1D + 2) / 4;"],
};

const arithmeticFunctions = [
  local("intSum", "number", "2147483647 + 1"),
  local("longProduct", "number", "4294967296 * 4294967296"),
  local("negatedIntMinimum", "number", "-(-2147483648)"),
  local("negatedHuge", "number", "-(1e19)"),
  local("negatedLongRange", "number", "-(9223372036854777856)"),
  local("zeroMinusHuge", "number", "0 - 1e19"),
  local("hugeTimesTwo", "number", "1e19 * 2"),
  local("huge", "number", "1e19"),
  local("remainder", "int32", "7 % 2"),
  local("sumInRange", "int32", "2147483646 + 1"),
  returned("tuple", "[uint32, int32]", "[1, 2] as [uint32, int32]"),
];
const surfaceArithmeticFunctions = {
  native: [
    returned("complementOfMinusOne", "uint32", "~(-1) as uint32"),
    returned("complementOfZero", "int32", "~0 as int32"),
    returned("unsignedComplement", "uint32", "~(0 as uint32) as uint32"),
  ],
  js: [returned("unsignedSum", "uint32", "(2147483647 + 1) as uint32")],
};
const surfaceArithmeticChecks = {
  native: "Subject.complementOfMinusOne() != 0u || Subject.complementOfZero() != -1 || Subject.unsignedComplement() != 4294967295u",
  js: "Subject.unsignedSum() != 2147483648u",
};

const conversionFunctions = {
  shared: [
    returned("doubleCancel", "uint8", "(1e20 + 300 - 1e20) as uint8"),
    returned("aboveExactDouble", "int32", "(9007199254740993 - 9007199254740992 + 2147483647) as int32"),
    returned("floatDecimal", "uint32", "((4294967296 as float32) as decimal) as uint32"),
    returned("floatDecimalExact", "uint32", "((1048576 as float32) as decimal) as uint32"),
    returned("floatDecimalDigits", "uint32", "((16777216 as float32) as decimal) as uint32"),
  ],
  native: [returned("intDecimal", "int32", "((2147483520 as float32) as decimal) as int32")],
  js: [],
};
const conversionChecks = {
  native: " || Subject.floatDecimalDigits() != 16777216u || Subject.intDecimal() != 2147483520",
  js: " || Subject.floatDecimalDigits() != 16777220u",
};

const refused = [
  [["native", "js"], "[uint32, int32]", "return", "[-1, 2] as [uint32, int32]", "Source numeric literal is outside the 'uint32' range.", "KindArrayLiteralExpression", "[-1, 2]", 0],
  [["native", "js"], "[uint8, int32]", "return", "[300, 1] as [uint8, int32]", "Source numeric literal is outside the 'uint8' range.", "KindArrayLiteralExpression", "[300, 1]", 0],
  [["native", "js"], "[uint32, int32]", "return", "[(-1 as int32), 2] as [uint32, int32]", "Source numeric literal is outside the 'uint32' range.", "KindArrayLiteralExpression", "[(-1 as int32), 2]", 0],
  [["native", "js"], "int32", "return", "~(0 as uint32) as int32", "Source numeric literal is outside the 'int32' range.", "KindPrefixUnaryExpression", "~(0 as uint32)", 0],
  [["native", "js"], "uint32", "return", "~(0 as int32) as uint32", "Source numeric literal is outside the 'uint32' range.", "KindPrefixUnaryExpression", "~(0 as int32)", 0],
  [["native", "js"], "uint32", "return", "(-1)! as uint32", "Source numeric literal is outside the 'uint32' range.", "KindNonNullExpression", "(-1)!", 0],
  [["native", "js"], "int8", "return", "(300 as uint8) as int8", "Source numeric literal is outside the 'uint8' range.", "KindNumericLiteral", "300", 1],
  [["native"], "uint32", "return", "~0 as uint32", "Source numeric literal is outside the 'uint32' range.", "KindPrefixUnaryExpression", "~0", 0],
  [["native"], "uint32", "return", "~2147483647 as uint32", "Source numeric literal is outside the 'uint32' range.", "KindPrefixUnaryExpression", "~2147483647", 0],
  [["native"], "int32", "local", "2147483647 + 1", "Source constant expression overflows the C# 'int32' range.", "KindBinaryExpression", "2147483647 + 1", 0],
  [["native"], "int32", "local", "65536 * 65536", "Source constant expression overflows the C# 'int32' range.", "KindBinaryExpression", "65536 * 65536", 0],
  [["native"], "int32", "local", "2147483647 + 1 - 1", "Source constant expression overflows the C# 'int32' range.", "KindBinaryExpression", "2147483647 + 1", 0],
  [["native"], "int32", "local", "1 / 0", "Source constant expression divides by zero.", "KindBinaryExpression", "1 / 0", 0],
  [["native"], "uint32", "return", "(2147483647 + 1) as uint32", "Source constant expression overflows the C# 'int32' range.", "KindBinaryExpression", "2147483647 + 1", 1],
  [["js"], "int32", "local", "2147483647 + 1", "No exact C# implicit conversion relates 'source:float64' to 'source:int32'.", "KindBinaryExpression", "2147483647 + 1", 0],
  [["js"], "int32", "local", "1 / 0", "No exact C# implicit conversion relates 'source:float64' to 'source:int32'.", "KindBinaryExpression", "1 / 0", 0],
  [["js"], "int32", "return", "((2147483520 as float32) as decimal) as int32", "Source numeric literal is outside the 'int32' range.", "KindParenthesizedExpression", "((2147483520 as float32) as decimal)", 0],
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

function compileAndRun(surface, name, functions, checks) {
  const compiled = compileCsharpSource({ surface, sourceText: header + functions.join("") });
  assertCsharpCompilationSucceeded(compiled);
  const output = executeCsharpConstruction(compiled, `${name}-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
${checks}
System.Console.WriteLine("${name}: correct");
`);
  assert.equal(output.trim(), `${name}: correct`);
  return generatedIndex(compiled);
}

const refusedSource = (type, form, expression) => form === "local"
  ? `${header}${local("f", type, expression)}`
  : `${header}${returned("f", type, expression)}`;

for (const surface of ["native", "js"]) {
  test(`${surface} float64 division of integer constants keeps its fractional value`, { timeout: 300_000 }, () => {
    const index = compileAndRun(surface, "constant-division", divisionFunctions[surface], `if (${divisionChecks[surface]})
    throw new System.Exception("float64 constant division");`);
    assert.deepEqual(divisionLines[surface].filter(line => !index.includes(line)), [],
      "the left integer literal of a float64 division is printed as a double literal");
  });

  test(`${surface} float64 and integral constant arithmetic compiles to C# that keeps its values`, { timeout: 300_000 }, () => {
    const index = compileAndRun(surface, "constant-arithmetic", [...arithmeticFunctions, ...surfaceArithmeticFunctions[surface]], `
if (Subject.intSum() != 2147483648.0 || Subject.longProduct() != 18446744073709551616.0 ||
    Subject.negatedIntMinimum() != 2147483648.0 || Subject.negatedHuge() != -1e19 ||
    Subject.negatedLongRange() != -9223372036854777856.0 || Subject.zeroMinusHuge() != -1e19 ||
    Subject.hugeTimesTwo() != 2e19 || Subject.huge() != 1e19)
    throw new System.Exception("float64 constant arithmetic");
var tuple = Subject.tuple();
if (Subject.remainder() != 1 || Subject.sumInRange() != 2147483647 || tuple.Item1 != 1u || tuple.Item2 != 2)
    throw new System.Exception("integral constant arithmetic");
if (${surfaceArithmeticChecks[surface]})
    throw new System.Exception("surface constant arithmetic");`);
    assert.deepEqual([
      "double y = 2147483647D + 1;",
      "double y = 4294967296D * 4294967296;",
      "double y = -(-2147483648D);",
      "double y = -(10000000000000000000D);",
      "double y = 0 - 10000000000000000000D;",
      "double y = 10000000000000000000D * 2;",
      "double y = 10000000000000000000D;",
      "int y = 7 % 2;",
      "int y = 2147483646 + 1;",
    ].filter(line => !index.includes(line)), [], "a float64 operation prints a double operand only where C# integral arithmetic would change the value");
  });

  test(`${surface} constants under explicit conversions keep the values C# gives them`, { timeout: 300_000 }, () => {
    const index = compileAndRun(surface, "constant-conversions", [...conversionFunctions.shared, ...conversionFunctions[surface]], `
if (Subject.doubleCancel() != 0 || Subject.aboveExactDouble() != 2147483647 || Subject.floatDecimal() != 4294967000u ||
    Subject.floatDecimalExact() != 1048576u${conversionChecks[surface]})
    throw new System.Exception("constant under an explicit conversion");`);
    assert.equal(index.includes(surface === "js" ? "return (uint)((decimal)((float)16777216));" : "return (uint)((decimal)(16777216));"), true,
      "a float32 value converts to decimal with seven significant digits, and an int32 literal converts exactly");
  });

  test(`${surface} constant expressions that C# rejects are refused at the source node with no artifact`, { timeout: 300_000 }, () => {
    const cases = refused.filter(([surfaces]) => surfaces.includes(surface));
    const outcomes = cases.map(([, type, form, expression]) => {
      const sourceText = refusedSource(type, form, expression);
      const compiled = compileCsharpSource({ surface, sourceText });
      const ast = createTargetSourceProgram(compiled.source).ast;
      return {
        expression,
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
    assert.deepEqual(outcomes, cases.map(([, type, form, expression, message, kind, text, offset]) => {
      const start = refusedSource(type, form, expression).indexOf(expression) + offset;
      return {
        expression,
        sourceDiagnostics: "",
        diagnostics: [{
          code: "CSHARP_UNSUPPORTED_AST",
          category: "error",
          message,
          source: "tsonic-csharp",
          node: { kind, text, start, end: start + text.length },
        }],
        artifacts: 0,
      };
    }), "each rejected constant expression is refused once, at its source node, and publishes nothing");
  });
}
