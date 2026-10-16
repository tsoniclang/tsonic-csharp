import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpTarget } from "../../../dist/backend/compile.js";

function literals(sourceText, surface = "native") {
  const compiled = compileCsharpSource({ surface, sourceText });
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, `${surface}: the program publishes`);
  const ast = program.source.ast;
  const found = [];
  const visit = (node) => {
    const datum = program.records.literalValue.get(node);
    if (datum !== undefined) found.push({ node, kind: ast.kindName(node), datum });
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  return { compiled, program, found };
}

test("one checked extraction publishes exact frozen literal data with bigint precision and signed zero", () => {
  for (const surface of ["native", "js"]) {
    const { program, found } = literals(`
      export const wide = 9007199254740993n;
      export const exact = 9007199254740993;
      export const zero = -0;
      export const grouped = (2 + 3) * 4;
      export const letters = ["a", "bc"];
      export const yes = true;
    `, surface);
    const byKind = (kind) => found.filter((entry) => entry.kind === kind);
    const wide = byKind("KindBigIntLiteral")[0]?.datum;
    assert.equal(wide?.form === "bigint" && wide.integer === 9007199254740993n, true, `${surface}: bigint keeps its exact value`);
    const exact = byKind("KindNumericLiteral").find((entry) => entry.datum.integer === 9007199254740993n)?.datum;
    assert.equal(exact !== undefined && exact.number === Number("9007199254740993"), true,
      `${surface}: a numeric literal keeps both its double and its exact integer`);
    const zero = byKind("KindPrefixUnaryExpression")[0]?.datum;
    assert.equal(zero !== undefined && Object.is(zero.number, -0) && zero.integer === 0n, true, `${surface}: -0 keeps signed zero`);
    const grouped = byKind("KindBinaryExpression").find((entry) => entry.datum.integerConstant === 20n);
    assert.equal(grouped !== undefined, true, `${surface}: an integer constant expression keeps its exact value`);
    const array = byKind("KindArrayLiteralExpression")[0]?.datum;
    assert.equal(array?.elements?.length === 2 && array.elements[0].text === "a" && array.elements[1].text === "bc", true,
      `${surface}: array data references each element datum`);
    assert.equal(byKind("KindTrueKeyword")[0]?.datum.form === "true", true, `${surface}: boolean literal form`);
    assert.equal(found.every((entry) => Object.isFrozen(entry.datum) && (entry.datum.elements === undefined || Object.isFrozen(entry.datum.elements))),
      true, `${surface}: every datum and element list is frozen`);
    assert.equal(found.every((entry) => (entry.datum.form === "array") === Array.isArray(entry.datum.elements) &&
      ((entry.datum.form === "string" || entry.datum.form === "template") === (typeof entry.datum.text === "string"))), true,
    `${surface}: array data always has elements and text data always has text, by form`);
    assert.equal(found.every((entry) => program.records.literalValue.get(entry.node) === entry.datum), true,
      `${surface}: every read returns the one extracted datum`);
  }
});

test("extraction covers literals that type resolution reaches before their declaration is visited", () => {
  const { compiled, found } = literals(`
    export function first(flag: boolean) { return later(flag); }
    function later(flag: boolean) { return flag ? 1 : 2; }
  `);
  assert.equal(compiled.result.diagnostics.length === 0, true, "the program compiles without diagnostics");
  const integers = found.filter((entry) => entry.kind === "KindNumericLiteral").map((entry) => entry.datum.integer);
  assert.equal(integers.includes(1n) && integers.includes(2n), true, "both conditional arms have data");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/public static int first\(bool flag\)/u.test(output) && /public static int later\(bool flag\)/u.test(output), true,
    "both functions keep the exact int carrier their literal arms select");
});

test("literals in type-only declarations, overload sets and abstract signatures are extracted without changing admission", () => {
  const { compiled, found } = literals(`
    export function pick(value: number): number;
    export function pick(value: number): number { return value + 1; }
    export abstract class Shape { abstract area(scale: number): number; size(): number { return 2; } }
    type Limit = 10;
    export const limit: Limit = 10;
  `);
  assert.equal(compiled.result.diagnostics.length === 0, true, "the program compiles without diagnostics");
  const integers = found.filter((entry) => entry.kind === "KindNumericLiteral").map((entry) => entry.datum.integer);
  assert.equal(integers.includes(1n) && integers.includes(2n) && integers.filter((value) => value === 10n).length >= 1, true,
    "literals in emitted bodies, the overload's body and the alias position all have data");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/abstract double area\(double scale\);/u.test(output) && /return 2;/u.test(output), true,
    "the abstract signature and the concrete body keep their native output");
});

test("selected float and decimal literal recipes preserve source precision, scale, zero sign and native defaults", () => {
  const sourceText = `import type { decimal, float32, float64 } from "@tsonic/core/types.js";
export function direct(): float32 { return 1.00000005960464477539062500000001; }
export function exact(): decimal { return 9007199254740993; }
export function whole(): decimal { return 1; }
export function scaled(): decimal { return 1.00; }
export function zero(): decimal { return 0.000; }
export function negativeZero(): decimal { return -0.000; }
export function exponent(): decimal { return 1.00e1; }
export function zeroExponent(): decimal { return 0.000e2; }
export function nativeCast(value: float64): float32 { return value as float32; }
export function withDefault(value: float32 = -1.5): float32 { return value; }
export function decimalDefault(value: decimal = -1.50): decimal { return value; }
`;
  for (const surface of ["native", "js"]) {
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText === "" && compiled.result.diagnostics.length === 0, true,
      `${surface}: exact native literal and explicit cast controls compile`);
    const output = [...compiled.artifacts.values()].join("\n");
    const required = ["1.00000005960464477539062500000001F", "9007199254740993M", "return 1M;", "return 1.00M;",
      "return 0.000M;", "return -0.000M;", "return 1.00e+1M;", "return 0.000e+2M;", "return (float)value;", "-1.5F", "-1.50M"];
    assert.deepEqual(required.filter(text => !output.includes(text)), [], `${surface}: exact syntax follows the selected native use`);
    assert.equal(/9007199254740992M|\b1\.0000000596046448F/u.test(output), false,
      `${surface}: the native token never uses the lossy double summary`);
    assert.doesNotThrow(() => JSON.stringify(compiled.result.plan), `${surface}: every native token remains JSON-safe`);
    const program = compiled.result.program;
    const defaults = program.sourceFiles.flatMap(file => program.source.ast.statements(file))
      .flatMap(node => program.source.ast.parameters(node))
      .filter(node => program.source.ast.as.AsParameterDeclaration(node)?.Initializer !== undefined);
    assert.equal(defaults.length === 2 && defaults.every(node => program.records.runtimeDefault.get(node) !== undefined), true,
      `${surface}: exact native numeric defaults use the sealed runtime-default producer, not the inline-literal allowlist`);
  }
});

test("numeric syntax follows the sealed operand carrier rather than the enclosing expected type", () => {
  const sourceText = `import type { float64, int32, int16, uint32 } from "@tsonic/core/types.js";
export function arithmetic(): number { return (1 + 2) / 4; }
export function scalar(): int32 { return 1; }
export function narrow(): int16 { return 7; }
export function unsigned(): uint32 { return 4294967295; }
export function preciseDouble(): float64 { return 9007199254740992; }
`;
  for (const surface of ["native", "js"]) {
    const { compiled, program, found } = literals(sourceText, surface);
    assert.equal(compiled.result.diagnostics.length, 0, `${surface}: selected scalar and arithmetic controls compile`);
    const output = [...compiled.artifacts.values()].join("\n");
    const arithmetic = found.find(entry => entry.kind === "KindBinaryExpression" && entry.datum.integerConstant === 0n);
    assert.equal(arithmetic !== undefined, true, `${surface}: the selected operation remains an operation`);
    const source = program.records.valueRead.get(arithmetic.node)?.source;
    assert.equal(source?.kind === "source-primitive" && source.name === (surface === "native" ? "int32" : "float64"), true,
      `${surface}: the intrinsic carrier is separate from the enclosing number context`);
    assert.equal(output.includes(surface === "native" ? "return (1 + 2) / 4;" : "return (1D + 2D) / 4D;"), true,
      `${surface}: arithmetic is not folded or retyped from the destination`);
    assert.equal(output.includes("return 9007199254740992D;"), true, `${surface}: the actual double is a native double at its producer`);
    assert.equal(output.includes("return (short)7;") && output.includes("return (uint)4294967295;"), true,
      `${surface}: scalar integer adaptation uses native constant casts`);
    assert.doesNotThrow(() => JSON.stringify(compiled.result.plan), `${surface}: the completed native AST contains no bigint payload`);
  }
});

test("checked float64 provenance keeps genuine native conversion operations and their value domain", () => {
  for (const surface of ["native", "js"]) {
    for (const [target, literal, accepted, syntax] of [
      ["float32", "1.00000005960464477539062500000001", true, "(float)1.0000000596046448D"],
      ["float32", "1e40", true, "(float)1e+40D"],
      ["decimal", "9007199254740992", true, "(decimal)9007199254740992D"],
      ["decimal", "1e30", false, undefined],
    ]) {
      const compiled = compileCsharpSource({ surface,
        sourceText: `import type { ${target} } from "@tsonic/core/types.js"; export function value(): ${target} { return ${literal}; }`,
        compileTarget(request) {
          const ast = request.input.source.ast;
          const source = { ...request.input.source, ast: { ...ast, authoredRange(node) {
            return node !== undefined && ast.is.IsNumericLiteral(node) ? { kind: "synthetic" } : ast.authoredRange(node);
          } } };
          return compileCsharpTarget({ ...request, input: { ...request.input, source } });
        } });
      const label = `${surface} ${target} ${literal}`;
      assert.equal(compiled.sourceDiagnosticsText, "", `${label}: checked source is valid`);
      assert.equal(compiled.result.diagnostics.length === 0, accepted, `${label}: actual conversion has its own native domain`);
      if (!accepted) continue;
      const output = [...compiled.artifacts.values()].join("\n");
      assert.equal(output.includes(syntax), true, `${label}: the cast consumes the actual double expression`);
      assert.equal(output.includes(`${Number(literal)}${target === "float32" ? "F" : "M"}`), false,
        `${label}: the value is not reinterpreted as an authored token`);
    }
    const variable = compileCsharpSource({ surface, sourceText: `import type { float32, float64 } from "@tsonic/core/types.js";
export function negativeZero(): float32 { const value: float64 = -0; return value as float32; }
export function overflow(): float32 { const value: float64 = 1e40; return value as float32; }
` });
    assert.equal(variable.result.diagnostics.length, 0, `${surface}: actual variable casts remain valid`);
    const output = [...variable.artifacts.values()].join("\n");
    assert.equal(output.includes("-0D") && output.includes("return (float)value;"), true,
      `${surface}: negative zero stays a real native conversion`);
  }
});
