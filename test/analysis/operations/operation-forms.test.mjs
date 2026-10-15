import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpBinaryOperationUsesExpectedResultType } from "../../../dist/policy/operations/operators/expected-result.js";
import { sourceOperatorFromKindName } from "../../../dist/target-model/syntax/operators.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

function recordedForms(compiled) {
  const program = compiled.result.program;
  const ast = program.source.ast;
  const forms = [];
  for (const sourceFile of program.sourceFiles) {
    if (!String(ast.getPath(sourceFile)).endsWith("/index.ts")) continue;
    const text = String(ast.getSourceText(sourceFile));
    const visit = (node) => {
      const snippet = () => text.slice(ast.pos(node), ast.end(node)).trim();
      if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
        forms.push(`operator ${snippet()} => ${program.records.operatorForm.get(node) ?? "none"}`);
      }
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    visit(sourceFile);
  }
  return forms;
}

function compiledWithoutDiagnostics(options) {
  const compiled = compileCsharpSource(options);
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  return compiled;
}

test("binary and unary forms are recorded once in the planner's order", () => {
  const compiled = compiledWithoutDiagnostics({ surface: "js", sourceText: `
    type T = { a: unknown };
    class A {}
    export function f(x: T, o: any, a: number[], v: unknown, n: number, m: number): unknown {
      let first = 0;
      [first] = a;
      a.length = 0;
      x.a = 1;
      o.p = 1;
      const shape = typeof v === "string";
      const test = v instanceof A;
      const sum = o + 1;
      const less = n < m;
      return [first, shape, test, sum, less, -n];
    }
  ` });
  assert.deepEqual(recordedForms(compiled), [
    "operator [first] = a => destructuring-assignment",
    "operator a.length = 0 => js-array-mutation",
    "operator x.a = 1 => js-value-write",
    "operator o.p = 1 => js-value-write",
    "operator typeof v === \"string\" => typeof-comparison",
    "operator v instanceof A => type-test",
    "operator o + 1 => js-value-operation",
    "operator n < m => selected",
    "operator -n => selected",
  ]);
});

test("operator form readers are frozen, repeatable and absent for foreign and non-operator subjects", () => {
  const compiled = compiledWithoutDiagnostics({ surface: "js", sourceText: `
    export function f(o: any, n: number, m: number): unknown { const sum = o + 1; const less = n < m; return [sum, less, -n]; }
  ` });
  const program = compiled.result.program;
  const ast = program.source.ast;
  const records = program.records;
  assert.equal(Object.isFrozen(records.operatorForm), true, "the operator form family is frozen");
  let operators = 0;
  const visit = (node) => {
    const label = `${ast.kindName(node)}@${ast.pos(node)}`;
    if (ast.is.IsBinaryExpression(node) || ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
      operators += 1;
      const form = records.operatorForm.get(node);
      const eligible = records.operatorForm.usesExpectedResultType(node);
      assert.equal(form !== undefined && records.operatorForm.get(node) === form, true, `${label}: one repeatable form`);
      assert.equal(records.operatorForm.usesExpectedResultType(node) === eligible, true, `${label}: repeatable eligibility`);
    } else {
      assert.equal(records.operatorForm.get(node) === undefined && records.operatorForm.usesExpectedResultType(node) === undefined, true,
        `${label}: a non-operator node has no operator form`);
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) {
    if (String(ast.getPath(sourceFile)).endsWith("/index.ts")) visit(sourceFile);
  }
  assert.equal(operators === 3, true, "two binary operators and one unary operator are visited");
  const foreign = {};
  assert.equal(records.operatorForm.get(foreign) === undefined && records.operatorForm.usesExpectedResultType(foreign) === undefined, true,
    "a foreign subject has no operator form");
});

test("an assignment without a direct C# operator is a selected form even on a JS-value object-shape member", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    type T = { a: unknown };
    export function f(x: T): void { x.toString ||= () => "y"; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, category, source, message }) => ({ code, category, source, message })),
    [{ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
      message: "Source operator '||=' requires a dedicated C# translation policy." }],
  );
  assert.equal(compiled.source.ast.kindName(compiled.result.diagnostics[0].sourceNode), "KindBinaryExpression");
});

test("an update of a JS-value object-shape member keeps its writable-location refusal", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    type T = { a: any };
    export function f(x: T): void { x.a++; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    [{ code: "CSHARP_UNSUPPORTED_AST",
      message: "Closed JS-value object-shape update '++' requires an exact writable-location translation; emitting a read expression as a C# location is forbidden." }],
  );
  assert.equal(compiled.source.ast.kindName(compiled.result.diagnostics[0].sourceNode), "KindPostfixUnaryExpression");
});

test("binary expected-result eligibility is stored once from the checked operator that every selection carries", () => {
  for (const [surface, sourceText] of [
    ["native", `
      import type { int32 } from "@tsonic/core/types.js";
      function touch(value: int32): int32 { return value; }
      export function f(a: int32, b: int32, c: int32 | undefined, flag: boolean): number {
        const wide: number = a + b;
        const narrow: int32 = a << b;
        const both: boolean = flag && a === b;
        const pick: int32 = c ?? a;
        const last: number = (touch(a), b);
        let total: int32 = a;
        total += b;
        return both ? wide + last : -narrow + total + pick;
      }
    `],
    ["js", `
      export function f(a: number, b: string | undefined, s: string): string {
        const sum: number = a * 2;
        const text: string = b ?? s;
        return s + sum + text;
      }
    `],
  ]) {
    const compiled = compiledWithoutDiagnostics({ surface, sourceText });
    const program = compiled.result.program;
    const ast = program.source.ast;
    const records = program.records;
    let eligibleContextual = 0;
    let ineligible = 0;
    let unary = 0;
    for (const sourceFile of program.sourceFiles) {
      if (!String(ast.getPath(sourceFile)).endsWith("/index.ts")) continue;
      const text = String(ast.getSourceText(sourceFile));
      const visit = (node) => {
        const label = `${surface} ${text.slice(ast.pos(node), ast.end(node)).trim()}`;
        if (ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
          assert.equal(records.operatorForm.usesExpectedResultType(node) === undefined, true, `${label}: a unary operator has no binary eligibility`);
          unary += 1;
        }
        if (ast.is.IsBinaryExpression(node)) {
          const checked = sourceOperatorFromKindName(ast.operatorKindName(node));
          const eligible = records.operatorForm.usesExpectedResultType(node);
          assert.equal(eligible === (checked === undefined ? undefined : csharpBinaryOperationUsesExpectedResultType(checked)), true,
            `${label}: the stored eligibility is the policy result for the checked operator`);
          const baseline = records.binaryOperation.get(node)?.target;
          assert.equal(baseline?.kind !== "resolved" || baseline.sourceOperator === checked, true, `${label}: the baseline selection carries the checked operator`);
          for (const target of records.expectedType.get(node)) {
            const selection = records.expectedBinary.get(node, target);
            if (selection?.kind !== "resolved") continue;
            assert.equal(selection.sourceOperator === checked && records.operatorForm.get(node) !== undefined, true,
              `${label}: a contextual selection carries the checked operator and has a stored form`);
            if (eligible === true && targetTypeRefEquals(selection.resultType, target)) eligibleContextual += 1;
          }
          if (eligible === false) ineligible += 1;
        }
        ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
      };
      visit(sourceFile);
    }
    assert.equal(eligibleContextual > 0 && ineligible > 0, true, `${surface}: eligible contextual results and ineligible operators are covered`);
    assert.equal(surface === "js" || unary > 0, true, `${surface}: a unary operator is covered`);
  }
});
