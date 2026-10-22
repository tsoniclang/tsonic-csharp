import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const forms = [
  ["reversed parenthesized", `("string") === (typeof x)`, `"string" === typeof x`, "string"],
  ["parenthesized typeof", `(typeof x) === "string"`, `typeof x === "string"`, "string"],
  ["parenthesized operand", `typeof (x) === "string"`, `typeof x === "string"`, "string"],
  ["parenthesized literal", `typeof x === ("string")`, `typeof x === "string"`, "string"],
  ["parenthesized everywhere", `(typeof (x)) === ("string")`, `typeof x === "string"`, "string"],
  ["negated parenthesized typeof", `(typeof x) !== "number"`, `typeof x !== "number"`, "number"],
  ["loose parenthesized typeof", `(typeof x) == "string"`, `typeof x == "string"`, "string"],
];

const sourceText = condition => `export function f(x: string | number): number {\n  if (${condition}) return 1;\n  return 0;\n}\n`;

function compileComparison(surface, condition) {
  const compiled = compileCsharpSource({ surface, sourceText: sourceText(condition) });
  assertCsharpCompilationSucceeded(compiled);
  const { ast } = compiled.source;
  const program = compiled.result.program;
  const comparisons = [];
  const visit = node => {
    const classification = ast.is.IsBinaryExpression(node)
      ? program.records.binaryOperation.get(node)?.typeofComparison
      : undefined;
    if (classification !== undefined) comparisons.push(classification);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  const output = compiled.result.artifacts.filter(artifact => artifact.path.endsWith(".cs"))
    .map(artifact => artifact.text).join("\n");
  const emitted = output.match(/^\s*if \((.*)\)\s*$/mu)?.[1];
  assert.ok(emitted, "the generated function keeps one if condition");
  return { ast, comparisons, condition: emitted };
}

for (const surface of [undefined, "js"]) {
  for (const [name, form, unwrapped, runtimeKind] of forms) {
    test(`${name} typeof comparisons use the shared source recognizer on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const expected = compileComparison(surface, unwrapped);
      const actual = compileComparison(surface, form);
      assert.equal(expected.comparisons.length, 1);
      assert.equal(actual.comparisons.length, 1, "the comparison is classified once, on its binary expression");
      const [comparison] = actual.comparisons;
      assert.equal(actual.ast.kindName(comparison.operand), "KindIdentifier",
        "the classified operand is the unwrapped source operand");
      assert.equal(actual.ast.text(comparison.operand), "x");
      assert.equal(comparison.runtimeKind, runtimeKind);
      assert.equal(comparison.selection.kind, expected.comparisons[0].selection.kind);
      assert.equal(actual.condition, expected.condition,
        "the wrapped form emits the same native category test as the unwrapped form");
      assert.doesNotMatch(actual.condition, /=> "(?:string|number)"/u,
        "no runtime typeof string is materialized for a closed native comparison");
    });
  }
}
