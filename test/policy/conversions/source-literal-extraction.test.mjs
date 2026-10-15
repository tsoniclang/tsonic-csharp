import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

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
