import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNumericLiteralRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

function calls(compiled) {
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "analyzed program is present");
  const ast = program.source.ast;
  const selected = [];
  for (const file of csharpProgramSourceFiles(program)) {
    if (!String(ast.getPath(file)).endsWith("/index.ts")) continue;
    const text = String(ast.getSourceText(file));
    const visit = node => {
      if (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node)) selected.push({ node,
        text: text.slice(ast.pos(node), ast.end(node)).trim(),
        classification: ast.is.IsCallExpression(node) ? program.records.selectedCall.get(node) : program.records.selectedConstruction.get(node) });
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
  }
  return selected;
}

for (const surface of [undefined, "js"]) test(`source argument owner publishes every actual binding and final group on ${surface ?? "native"}`, () => {
  const originalSourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    function pair(first: int32, second: int32): int32 { return first + second; }
    function maybe(first: int32, second?: int32): int32 { return first; }
    function sum(...values: number[]): number { let total = 0; for (const value of values) total += value; return total; }
    export function exact(): int32 { return pair(1 as int32, 2 as int32); }
    export function omitted(): int32 { return maybe(1 as int32); }
    export function collected(): number { return sum(1, 2, 3); }
    export function forwarded(values: number[]): number { return sum(...values); }
    export function mixed(values: number[]): number { return sum(1, ...values, 4); }
  `;
  assertNumericLiteralRefusal(compileCsharpSource({ surface, sourceText: originalSourceText }),
    [numericCompoundRefusal("+=", "total += value")]);
  const compiled = compileCsharpSource({ surface,
    sourceText: originalSourceText.replace("let total = 0", "let total: number = 0") });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  const selected = calls(compiled);
  assert.equal(selected.length, 5, "five actual call owners ran");
  for (const call of selected) {
    const classification = call.classification;
    const grouping = classification?.sourceArgumentGrouping;
    assert.equal(grouping?.kind, "grouped", call.text);
    assert.equal("sourceNativeParameters" in classification, false, `${call.text}: no alternate raw parameter path`);
    assert.equal(grouping.arguments.length, classification.source.sourceArgumentBindings.length, `${call.text}: complete binding count`);
    for (const entry of grouping.arguments) {
      assert.equal(entry.binding === classification.source.sourceArgumentBindings[entry.effectiveArgumentIndex], true, `${call.text}: binding identity`);
      assert.equal(entry.expression === classification.source.sourceArguments[entry.sourceArgumentIndex].expression, true, `${call.text}: expression identity`);
      assert.equal(entry.sourceParameterIndex === entry.binding.sourceParameterIndex, true, `${call.text}: source parameter key`);
      assert.equal(Object.isFrozen(entry), true, `${call.text}: frozen binding`);
    }
    assert.equal(Object.isFrozen(grouping) && Object.isFrozen(grouping.groups), true, `${call.text}: immutable groups`);
  }
});

for (const surface of [undefined, "js"]) {
  for (const operator of ["+=", "-=", "*=", "/="]) {
    test(`native compound ${operator} refuses a later float operand without retyping int64 on ${surface ?? "native"}`, () => {
      const sourceText = `export function run(next: number): number { let value = 0; value ${operator} next; return value; }`;
      assertNumericLiteralRefusal(compileCsharpSource({ surface, sourceText }),
        [numericCompoundRefusal(operator, `value ${operator} next`)]);
      const compiled = compileCsharpSource({ surface, sourceText: sourceText.replace("let value = 0", "let value: number = 0") });
      assert.equal(compiled.result.diagnostics.length === 0 && compiled.result.program !== undefined && compiled.artifacts.size > 0, true,
        "the own number declaration retains the supported native operation");
    });
  }
  test(`native compound narrowing, shifts, integer division and one-evaluation locations remain valid on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: `
      import type { uint8, int16, int32 } from "@tsonic/core/types.js";
      export function run(): boolean {
        let tiny: uint8 = 7; const step: uint8 = 2; tiny += step; tiny += 1;
        let shifted: int16 = 2; const distance: int32 = 1; shifted <<= distance;
        let divided = 5; divided /= 2;
        let reads = 0; let writes = 0; let receivers = 0; let operands = 0; let stored: number = 3;
        const owner = { get value(): number { reads++; return stored; }, set value(next: number) { writes++; stored = next; } };
        function receiver(): typeof owner { receivers++; return owner; }
        function operand(): number { operands++; return 2; }
        receiver().value += operand();
        return tiny === 10 && shifted === 4 && divided === 2 && stored === 5 &&
          reads === 1 && writes === 1 && receivers === 1 && operands === 1;
      }` }), `numeric-native-compound-${surface ?? "native"}`);
  });
}

test("numeric assignment literals consume their own completed storage without retyping a written float", () => {
  for (const surface of [undefined, "js"]) {
    const sourceText = "export function reset(): boolean { let value = 0; value = 1; value += 2; value = -0; let floating: number = 0; floating = -0; return value === 0 && floating === 0; }";
    const integral = compileCsharpSource({ surface, sourceText });
    assert.equal(integral.result.diagnostics.length === 0 && integral.result.program !== undefined, true,
      "an assignment literal consumes the actual native storage, not the checker's erased number");
    const original = "export function assign(): number { let value = 0; value = 1.0; return value; }";
    assertNumericLiteralRefusal(compileCsharpSource({ surface, sourceText: original }),
      [{ code: "CSHARP_UNSUPPORTED_AST", message: "No exact C# implicit conversion relates 'source:float64' to 'source:int64'.", text: "1.0" }]);
    const declared = compileCsharpSource({ surface, sourceText: original.replace("let value = 0", "let value: number = 0") });
    assert.equal(declared.result.diagnostics.length === 0 && declared.result.program !== undefined, true,
      "a written float never becomes an integer to satisfy an earlier inferred binding");
  }
});

for (const surface of [undefined, "js"]) {
  test(`selected native indexer literals use their declared parameter without admitting int64 variables on ${surface ?? "native"}`, () => {
    const declarations = 'import { List } from "@tsonic/dotnet/System.Collections.Generic.js"; ';
    const compiled = compileCsharpSource({ surface, sourceText: declarations +
      "export function read(values: List<number>): number { return values[0]; }" });
    assert.equal(compiled.result.diagnostics.length === 0 && compiled.result.program !== undefined, true,
      "the direct index literal has its selected native int32 parameter");
    assert.match(compiled.artifacts.get("src/Index.cs"), /return values\[0\];/u);
    for (const [sourceText, text] of [
      ["export function read(values: List<number>): number { const index = 0; return values[index]; }", "values[index]"],
      ["export function read(values: List<number>): number { return values[2147483648]; }", "values[2147483648]"],
    ]) {
      assertNumericLiteralRefusal(compileCsharpSource({ surface, sourceText: declarations + sourceText }),
        [{ code: "CSHARP_TARGET_ELEMENT_NOT_CLOSED", message: "No related C# provider indexer satisfies the exact selected element access.", text }]);
    }
  });
}

test("canonical generic calls bind an unannotated integer while own declared Promise contexts stay floating", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function untyped() { return Promise.resolve(5); }
    export function declared(): Promise<number> { return Promise.resolve(5); }
    export function explicit(): Promise<number> { return Promise.resolve<number>(5); }
  ` });
  assert.equal(compiled.result.diagnostics.length === 0 && compiled.result.program !== undefined, true,
    "one canonical instantiation closes the actual source argument and its own declared result context");
  const generated = compiled.artifacts.get("src/Index.cs");
  assert.match(generated, /Task<long> untyped\(/u);
  assert.match(generated, /Task<double> declared\(/u);
  assert.match(generated, /Task<double> explicit\(/u);
});

test("tuple spreads preserve exact per-call refusal without admitting a prefix", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    function pair(first: int32, second: int32): int32 { return first + second; }
    function triple(first: int32, second: int32, third: int32): int32 { return first + second + third; }
    export function spread(values: [int32, int32]): int32 { return pair(...values); }
    export function prefixed(values: [int32, int32]): int32 { return triple(1 as int32, ...values); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  // analysis/ owns all source admission (tsonic/docs/architecture/csharp-rust-structure.md, analysis/ row): the grouping
  // refusal is an analysis refusal, so no program, plan or artifacts are published (RULINGS 2026-10-22).
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "no program, plan or artifacts after the refusal");
  const ast = compiled.source.ast;
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim();
  const refused = compiled.result.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.message,
    ast.is.IsCallExpression(diagnostic.sourceNode) ? text(diagnostic.sourceNode) : undefined]);
  assert.deepEqual(refused.sort((left, right) => String(left[2]).localeCompare(String(right[2]))), [
    ["CSHARP_UNSUPPORTED_AST", "Source-owned tuple-spread arguments require an explicit expansion plan.", "pair(...values)"],
    ["CSHARP_UNSUPPORTED_AST", "Source-owned tuple-spread arguments require an explicit expansion plan.", "triple(1 as int32, ...values)"],
  ], "one original refusal on each original call; no prefix is admitted");
});

test("native grouping preserves receiver, sequence and argument evaluation once in source order", () => {
  const compiled = compileCsharpSource({ sourceText: `
    let order = "";
    function mark(value: string): number { order += value; return 1; }
    class Collector { total(first: number, ...tail: number[]): number { let total = first; for (const value of tail) total += value; return total; } }
    function receiver(): Collector { mark("r"); return new Collector(); }
    function sequence(): number[] { mark("s"); return [2, 3]; }
    export function run(): boolean { return receiver().total(mark("a"), ...sequence(), mark("b")) === 7 && order === "rasb"; }
  ` });
  executeCsharpConstruction(compiled, "source-argument-receiver-order");
});

test("native grouping preserves evaluated callee, element key, argument and call order", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let order = "";
    function entry(value: number): number { order += "c"; return value; }
    function receivers(): ((value: number) => number)[] { order += "r"; return [entry]; }
    function key(): int32 { order += "k"; return 0; }
    function argument(): number { order += "a"; return 1; }
    export function run(): boolean { return receivers()[key()](argument()) === 1 && order === "rkac"; }
  ` });
  executeCsharpConstruction(compiled, "source-argument-key-order");
});
