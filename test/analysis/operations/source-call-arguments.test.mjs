import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpSourceArgumentGrouping } from "../../../dist/policy/operations/members/selection/source-argument-groups.js";

function calls(compiled) {
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "analyzed program is present");
  const ast = program.source.ast;
  const selected = [];
  for (const file of program.sourceFiles) {
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
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    function pair(first: int32, second: int32): int32 { return first + second; }
    function maybe(first: int32, second?: int32): int32 { return first; }
    function sum(...values: number[]): number { let total = 0; for (const value of values) total += value; return total; }
    export function exact(): int32 { return pair(1 as int32, 2 as int32); }
    export function omitted(): int32 { return maybe(1 as int32); }
    export function collected(): number { return sum(1, 2, 3); }
    export function forwarded(values: number[]): number { return sum(...values); }
    export function mixed(values: number[]): number { return sum(1, ...values, 4); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  const selected = calls(compiled);
  assert.equal(selected.length, 5, "five actual call owners ran");
  for (const call of selected) {
    const classification = call.classification;
    const grouping = classification?.sourceArgumentGrouping;
    assert.equal(grouping?.kind, "grouped", call.text);
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

test("tuple spreads preserve exact per-call refusal without admitting a prefix", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    function pair(first: int32, second: int32): int32 { return first + second; }
    function triple(first: int32, second: int32, third: int32): int32 { return first + second + third; }
    export function spread(values: [int32, int32]): int32 { return pair(...values); }
    export function prefixed(values: [int32, int32]): int32 { return triple(1 as int32, ...values); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  const selected = calls(compiled);
  assert.equal(selected.length, 2);
  assert.equal(compiled.result.diagnostics.length, 2);
  assert.equal(compiled.artifacts.size, 0);
  for (const call of selected) {
    const grouping = call.classification?.sourceArgumentGrouping;
    assert.equal(grouping?.kind, "refused", call.text);
    assert.equal("arguments" in grouping || "groups" in grouping, false, `${call.text}: no partial prefix`);
    assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.sourceNode === call.node &&
      diagnostic.code === "CSHARP_UNSUPPORTED_AST" && diagnostic.message === "Source-owned arguments have no exact native parameter grouping."), true,
    `${call.text}: original refusal on original call`);
  }
});

test("missing final argument types do not erase the distinction between pending and inconsistent bindings", () => {
  const compiled = compileCsharpSource({ sourceText: `function pair(first: number, second: number): number { return first + second; }
    export function run(): number { return pair(1, 2); }` });
  assert.equal(compiled.result.diagnostics.length, 0);
  const classification = calls(compiled)[0].classification;
  const source = classification.source;
  const slots = source.sourceSelectedSignatureParameters.map(parameter => ({ sourceParameterIndex: parameter.parameterIndex,
    sourceParameterName: parameter.parameterName, form: "required" }));
  assert.equal(selectCsharpSourceArgumentGrouping(source, classification.sourceNativeParameters, [classification.sourceArgumentParameterTypes[0], undefined], slots).kind,
    "unresolved");
  const wrong = { ...source, sourceArgumentBindings: source.sourceArgumentBindings.map((binding, index) => index === 1 ?
    { ...binding, sourceParameterIndex: 0 } : binding) };
  assert.equal(selectCsharpSourceArgumentGrouping(wrong, classification.sourceNativeParameters, classification.sourceArgumentParameterTypes, slots).kind,
    "inconsistent");
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
