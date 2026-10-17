import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

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
  program.sourceFiles.forEach(visit);
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

for (const surface of ["native", "js"]) test(`${surface} a JS-value typeof comparison consumes its already selected runtime operation`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    export function run(value: unknown): boolean { return typeof value === "object"; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  let comparisons = 0;
  let runtime = 0;
  const visit = node => {
    if (program.source.ast.is.IsBinaryExpression(node)) {
      comparisons++;
      assert.equal(program.records.binaryOperation.get(node)?.typeofComparison, undefined,
        "a native constant/category specialization must not replace the selected dynamic observation");
    }
    if (program.source.ast.is.IsTypeOfExpression(node)) {
      const operand = program.source.ast.as.AsTypeOfExpression(node).Expression;
      const operation = program.records.jsTypeof.get(operand);
      runtime++;
      assert.equal(operation?.kind === "resolved" && operation.runtimeMember === "ApplyDynamicTypeof", true,
        "one existing runtime owner retains the actual unknown value's category");
    }
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  assert.equal(comparisons === 1 && runtime === 1, true, "the exact comparison and its sole runtime observation were both found");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes("ApplyDynamicTypeof"), true, "the sealed runtime observation reaches native emission unchanged");
});
