import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpTarget } from "../../../dist/backend/compile.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { csharpNumericLiteralInteger } from "../../../dist/policy/conversions/literal-range.js";

function literals(sourceText, surface = "native") {
  const compiled = compileCsharpSource({ surface, sourceText });
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, `${surface}: the program publishes`);
  const source = program.source;
  const ast = source.ast;
  const found = [];
  for (const node of source.facts.values.occurrences()) {
    const evidence = resolvedSourceValue(source.facts.values.type(node), "the authoritative original value occurrence");
    source.facts.descriptors.assertEvidence(evidence);
    const scalar = source.facts.descriptors.scalarLiteral(evidence);
    if (scalar.kind === "present") found.push({ node, kind: ast.kindName(node), evidence, datum: scalar.value });
  }
  return { compiled, program, found, source };
}

test("one checked extraction publishes exact frozen literal data with bigint precision and signed zero", () => {
  for (const surface of ["native", "js"]) {
    const { program, source, found } = literals(`
      export const wide = 9007199254740993n;
      export const exact = 9007199254740993;
      export const zero = -0;
      export const grouped = (2 + 3) * 4;
      export const letters = ["a", "bc"];
      export const yes = true;
    `, surface);
    const byKind = (kind) => found.filter((entry) => entry.kind === kind);
    const wide = byKind("KindBigIntLiteral")[0]?.datum;
    assert.equal(wide?.kind === "bigint" && wide.value === 9007199254740993n, true, `${surface}: bigint keeps its exact value`);
    const exact = byKind("KindNumericLiteral").find(entry => csharpNumericLiteralInteger(entry.datum) === 9007199254740993n)?.datum;
    assert.equal(exact?.kind === "number" && exact.value.kind === "authored" &&
      exact.value.token.decimalText === "9007199254740993", true,
      `${surface}: the original decimal token is never rounded through a double`);
    const zero = byKind("KindPrefixUnaryExpression")[0]?.datum;
    assert.equal(zero?.kind === "number" && zero.value.kind === "authored" &&
      zero.value.token.negative && zero.value.token.coefficient === 0n, true, `${surface}: -0 keeps its original sign`);
    const grouped = byKind("KindBinaryExpression").find(entry => csharpNumericLiteralInteger(entry.datum) === 20n);
    assert.equal(grouped !== undefined, true, `${surface}: an integer constant expression keeps its exact value`);
    const arrays = source.facts.values.occurrences().filter(node => source.ast.is.IsArrayLiteralExpression(node));
    assert.equal(arrays.length, 1, `${surface}: one original array construction`);
    const construction = resolvedSourceValue(source.facts.values.construction(arrays[0]), "original array evaluation");
    assert.equal(construction.kind, "present");
    assert.equal(construction.value.kind, "array");
    assert.deepEqual(construction.value.evaluation.map(entry => {
      const scalar = source.facts.descriptors.scalarLiteral(entry.value);
      assert.equal(entry.form === "value" && scalar.kind === "present" && scalar.value.kind === "string", true);
      return scalar.value.value;
    }), ["a", "bc"], `${surface}: authored array grouping references exact child evidence, not a recursive literal census`);
    assert.equal(byKind("KindTrueKeyword")[0]?.datum.kind === "boolean" &&
      byKind("KindTrueKeyword")[0].datum.value, true, `${surface}: boolean literal value`);
    assert.equal(found.every(entry => Object.isFrozen(entry.datum)) && Object.isFrozen(construction.value.evaluation),
      true, `${surface}: the scalar units and authored construction vector are immutable`);
    assert.equal(found.every(entry => source.facts.descriptors.scalarLiteral(entry.evidence).value === entry.datum), true,
      `${surface}: every read returns the same original singleton unit`);
    assert.equal(Object.hasOwn(program.records, "literalValue"), false, `${surface}: the detached Native literal census is retired`);
  }
});

test("extraction covers literals that type resolution reaches before their declaration is visited", () => {
  const { compiled, found } = literals(`
    export function first(flag: boolean) { return later(flag); }
    function later(flag: boolean) { return flag ? 1 : 2; }
  `);
  assert.equal(compiled.result.diagnostics.length === 0, true, "the program compiles without diagnostics");
  const integers = found.filter((entry) => entry.kind === "KindNumericLiteral").map(entry => csharpNumericLiteralInteger(entry.datum));
  assert.equal(integers.includes(1n) && integers.includes(2n), true, "both conditional arms have data");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/public static long first\(bool flag\)/u.test(output) && /public static long later\(bool flag\)/u.test(output), true,
    "both functions retain the ruled native int64 integer-creation carrier");
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
  const integers = found.filter((entry) => entry.kind === "KindNumericLiteral").map(entry => csharpNumericLiteralInteger(entry.datum));
  assert.equal(integers.includes(1n) && integers.includes(2n) && integers.filter((value) => value === 10n).length >= 1, true,
    "the overload implementation, concrete body and original initializer have authentic singleton units");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/abstract double area\(double scale\);/u.test(output) && /return 2(?:L|D)?;/u.test(output), true,
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
    const defaults = csharpProgramSourceFiles(program).flatMap(file => program.source.ast.statements(file))
      .filter(node => node !== undefined && program.source.ast.is.IsFunctionDeclaration(node))
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
    const ast = program.source.ast;
    const arithmetic = program.source.facts.values.occurrences().find(node => ast.is.IsBinaryExpression(node) &&
      ast.authoredRange(node).kind === "authored" && ast.getSourceText(ast.getSourceFile(node))
        .slice(ast.authoredRange(node).start, ast.authoredRange(node).end) === "(1 + 2) / 4");
    assert.equal(arithmetic !== undefined, true, `${surface}: the selected operation remains an operation`);
    const source = program.records.valueRead.get(arithmetic)?.source;
    assert.equal(source?.kind === "source-primitive" && source.name === "int64", true,
      `${surface}: the intrinsic carrier is separate from the enclosing number context`);
    assert.equal(program.records.binaryOperation.get(arithmetic) !== undefined, true,
      `${surface}: the original arithmetic has a sealed operation, not a folded destination literal`);
    assert.match(output, /\(1L \+ 2L\) \/ 4L/u, `${surface}: arithmetic operands retain their native integer producers`);
    assert.equal(output.includes("return 9007199254740992D;"), true, `${surface}: the actual double is a native double at its producer`);
    assert.equal(output.includes("return (short)7;") && output.includes("return (uint)4294967295;"), true,
      `${surface}: scalar integer adaptation uses native constant casts`);
    assert.doesNotThrow(() => JSON.stringify(compiled.result.plan), `${surface}: the completed native AST contains no bigint payload`);
  }
});

test("Source provenance survives Native AST decoration and actual float64 casts remain operations", () => {
  for (const surface of ["native", "js"]) {
    for (const [target, literal, accepted, syntax] of [
      ["float32", "1.00000005960464477539062500000001", true, "1.00000005960464477539062500000001F"],
      ["float32", "1e40", false, undefined],
      ["decimal", "9007199254740992", true, "9007199254740992M"],
      ["decimal", "1e30", false, undefined],
    ]) {
      let originalUnit;
      const compiled = compileCsharpSource({ surface,
        sourceText: `import type { ${target} } from "@tsonic/core/types.js"; export function value(): ${target} { return ${literal}; }`,
        compileTarget(request) {
          const ast = request.input.source.ast;
          const occurrences = request.input.source.facts.values.occurrences().filter(node => ast.is.IsNumericLiteral(node));
          assert.equal(occurrences.length, 1, "one original numeric occurrence");
          const evidence = resolvedSourceValue(request.input.source.facts.values.type(occurrences[0]), "original authored evidence");
          const scalar = request.input.source.facts.descriptors.scalarLiteral(evidence);
          assert.equal(scalar.kind === "present" && scalar.value.kind === "number" && scalar.value.value.kind === "authored", true,
            "an emission AST decorator cannot replace registered Source provenance");
          originalUnit = scalar.value;
          const source = { ...request.input.source, ast: { ...ast, authoredRange(node) {
            return node !== undefined && ast.is.IsNumericLiteral(node) ? { kind: "synthetic" } : ast.authoredRange(node);
          } } };
          return compileCsharpTarget({ ...request, input: { ...request.input, source } });
        } });
      const label = `${surface} ${target} ${literal}`;
      assert.equal(compiled.sourceDiagnosticsText, "", `${label}: checked source is valid`);
      assert.equal(compiled.result.diagnostics.length === 0, accepted, `${label}: original authored precision and range remain authoritative`);
      assert.equal(originalUnit?.kind === "number" && originalUnit.value.kind === "authored", true);
      if (!accepted) continue;
      const output = [...compiled.artifacts.values()].join("\n");
      assert.equal(output.includes(syntax), true, `${label}: the Native token consumes unchanged Source provenance`);
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
