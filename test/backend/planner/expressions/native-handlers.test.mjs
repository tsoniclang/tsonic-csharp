import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planExpression } from "../../../../dist/backend/planner/expressions/index.js";
import { planCsharpMemoryBinding } from "../../../../dist/backend/planner/expressions/memory-bindings.js";
import { planCsharpExplicitSafetyExpression } from "../../../../dist/backend/planner/safety/explicit-safety.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

test("the C# root reads its selected descriptor once and never queries a losing applicability family", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { unsafe } from "@tsonic/csharp/lang.js";
    import { loadnativeptr } from "@tsonic/core/lang.js";
    import type { ptr } from "@tsonic/csharp/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    export function read(pointer: ptr<int32>): int32 { return unsafe(loadnativeptr(pointer)); }
  `, targetOptions: { languageDialect: "csharp15-preview" } });
  assert.equal(compiled.result.diagnostics.length === 0, true,
    `checked native-handler source; codes: ${compiled.result.diagnostics.map(({ code }) => code).join(", ")}`);
  const program = compiled.result.program;
  const { ast } = program.source;
  let call;
  const visit = node => {
    if (ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "unsafe") call = node;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  assert.equal(call !== undefined, true, "the exact unsafe call is present");
  const selected = Object.freeze({ kind: "native-pointer", selection: Object.freeze({ kind: "layout-query", value: 0 }) });
  let reads = 0;
  const records = new Proxy({ ...program.records, nativeHandler: { get(node) {
    if (node === call) { reads++; return selected; }
    return program.records.nativeHandler.get(node);
  } } }, { get(value, name) {
    assert.equal(!["memoryBinding", "nativePointer", "typedLocation", "jsStringConversion"].includes(name), true,
      `no raw native query: ${String(name)}`);
    return value[name];
  } });
  const diagnostics = [];
  const planned = planExpression(call, ast.getSourceFile(call), createCsharpPlanningContext({ ...program, records }), diagnostics);
  assert.equal(planned?.completion.kind === "value", true, "the selected layout has a value completion");
  assert.equal(planned.completion.expression.kind === "NumericLiteralExpression", true, "the layout emits native numeric syntax");
  assert.equal(planned.completion.expression.value === 0, true, "zero layout is retained");
  assert.equal(reads === 1, true, "the root reads the selected descriptor exactly once");
  assert.equal(diagnostics.length === 0, true,
    `selected layout diagnostics; codes: ${diagnostics.map(({ code }) => code).join(", ")}`);
});

test("a selected memory operand may fail but never delegates to a second renderer", () => {
  const operand = {};
  let calls = 0;
  const diagnostics = [];
  const records = new Proxy({}, { get: (_, name) => assert.fail(`No raw applicability query: ${String(name)}`) });
  const selected = { kind: "field", expression: operand };
  const planned = planCsharpMemoryBinding({}, selected, {}, { program: { records } }, diagnostics, node => {
    calls++; assert.equal(node === operand, true, "the selected memory operand retains source identity"); return undefined;
  });
  assert.equal(planned === undefined, true, "a failed selected operand has no planned expression");
  assert.equal(calls === 1, true, "the failed selected operand is visited once without fallback");
  assert.equal(diagnostics.length === 0, true,
    `failed selected operand diagnostics; codes: ${diagnostics.map(({ code }) => code).join(", ")}`);
});

test("selected safety rejection remains the original source diagnostic rather than an internal invariant", () => {
  const diagnostics = [];
  const selected = { kind: "safety-builder", fact: { kind: "builder-state" } };
  assert.equal(planCsharpExplicitSafetyExpression({}, selected, {}, {}, diagnostics, undefined,
    () => assert.fail("a rejected safety marker has no operand")) === undefined, true,
    "the selected safety builder preserves its source rejection");
  assert.equal(diagnostics.length === 1, true, "the selected safety builder emits exactly one diagnostic");
  assert.equal(diagnostics[0].code === "CSHARP_SAFETY_MARKER_RUNTIME_POSITION_UNSUPPORTED", true,
    `the original safety source code is retained: ${diagnostics[0].code}`);
});
