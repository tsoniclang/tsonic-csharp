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
  const runtimeOperands = [];
  const visit = node => {
    const classification = ast.is.IsBinaryExpression(node)
      ? program.records.binaryOperation.get(node)?.typeofComparison
      : undefined;
    if (classification !== undefined) comparisons.push(classification);
    if (ast.is.IsTypeOfExpression(node)) runtimeOperands.push(ast.as.AsTypeOfExpression(node).Expression);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  assert.equal(runtimeOperands.length, 1, "one actual typeof expression owns the operation");
  const operand = runtimeOperands[0];
  assert.equal(program.records.jsTypeof.get(operand) !== undefined, true,
    "the sole category operation remains keyed by the actual source operand, including its wrapper");
  if (comparisons[0]?.operand !== operand) {
    assert.equal(program.records.jsTypeof.get(comparisons[0]?.operand) === undefined, true,
      "native category comparison consumes its own sealed selection, not a second eager operation on the unwrapped value");
  }
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

for (const surface of ["native", "js"]) test(`${surface} type-only imports and queries never acquire runtime typeof registrations`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    export class Subject { value: int32 = 0; }
    attribute<Subject>().add(() => new ObsoleteAttribute("old", true));
    export function inspect(value: unknown): string {
      type Local = typeof value;
      const held = value;
      return typeof held;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const ast = program.source.ast;
  let erasedSubjects = 0;
  let runtimeOperands = 0;
  const visit = node => {
    if (ast.is.IsImportClause(node) && ast.isTypeOnlyImportOrExportDeclaration(node)) {
      erasedSubjects++;
      assert.equal(program.records.jsTypeof.get(node) === undefined, true,
        "the real symbol-less type-only import clause is outside the runtime operand domain");
    }
    if (ast.is.IsTypeQueryNode(node)) {
      erasedSubjects++;
      const name = ast.as.AsTypeQueryNode(node).ExprName;
      assert.equal(program.records.jsTypeof.get(name) === undefined, true,
        "the exact type-query reference has no runtime category operation");
    }
    if (ast.is.IsTypeOfExpression(node)) {
      runtimeOperands++;
      const operand = ast.as.AsTypeOfExpression(node).Expression;
      const selected = program.records.jsTypeof.get(operand);
      assert.equal(selected?.kind === "resolved" && selected.runtimeMember === "ApplyDynamicTypeof", true,
        "the actual retained unknown operand keeps its canonical runtime observation");
      assert.equal(program.records.jsTypeof.get(node) === undefined, true,
        "the operation is keyed by the exact operand, not its parent expression");
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  assert.equal(erasedSubjects, 2, "the original import clause and type-only value query were both checked");
  assert.equal(runtimeOperands, 1, "the sole real typeof operand is admitted once");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes('[System.ObsoleteAttribute("old", true)]'), true,
    "the valid original native attribute still reaches emitted C#");
  assert.equal(output.includes("ApplyDynamicTypeof"), true,
    "removing invalid eager registrations does not remove the retained native runtime observation");
});
