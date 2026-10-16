import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planExpression } from "../../../../dist/backend/planner/expressions/index.js";
import { planCsharpMemoryBinding } from "../../../../dist/backend/planner/expressions/memory-bindings.js";
import { planCsharpExplicitSafetyExpression } from "../../../../dist/backend/planner/safety/explicit-safety.js";

test("the C# root reads its selected descriptor once and never queries a losing applicability family", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { unsafe } from "@tsonic/csharp/lang.js";
    import { loadnativeptr } from "@tsonic/core/lang.js";
    import type { ptr } from "@tsonic/csharp/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    export function read(pointer: ptr<int32>): int32 { return unsafe(loadnativeptr(pointer)); }
  `, targetOptions: { languageDialect: "csharp15-preview" } });
  assert.equal(compiled.result.diagnostics.length, 0);
  const program = compiled.result.program;
  const { ast } = program.source;
  let call;
  const visit = node => {
    if (ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "unsafe") call = node;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  assert.equal(call !== undefined, true);
  const selected = Object.freeze({ kind: "native-pointer", selection: Object.freeze({ kind: "layout-query", value: 0 }) });
  let reads = 0;
  const records = new Proxy({ ...program.records, nativeHandler: { get(node) {
    if (node === call) { reads++; return selected; }
    return program.records.nativeHandler.get(node);
  } } }, { get(value, name) {
    assert.equal(["memoryBinding", "nativePointer", "typedLocation", "jsStringConversion"].includes(name), false, `no raw native query: ${String(name)}`);
    return value[name];
  } });
  const diagnostics = [];
  const planned = planExpression(call, ast.getSourceFile(call), createCsharpPlanningContext({ ...program, records }), diagnostics);
  assert.equal(planned?.completion.kind, "value");
  assert.equal(planned.completion.expression.kind, "NumericLiteralExpression");
  assert.equal(planned.completion.expression.value, 0);
  assert.equal(reads, 1);
  assert.deepEqual(diagnostics, []);
});

test("a selected memory operand may fail but never delegates to a second renderer", () => {
  const operand = {};
  let calls = 0;
  const diagnostics = [];
  const records = new Proxy({}, { get: (_, name) => assert.fail(`No raw applicability query: ${String(name)}`) });
  const selected = { kind: "field", expression: operand };
  const planned = planCsharpMemoryBinding({}, selected, {}, { program: { records } }, diagnostics, node => {
    calls++; assert.equal(node === operand, true); return undefined;
  });
  assert.equal(planned === undefined, true);
  assert.equal(calls, 1);
  assert.deepEqual(diagnostics, []);
});

test("selected safety rejection remains the original source diagnostic rather than an internal invariant", () => {
  const diagnostics = [];
  const selected = { kind: "safety-builder", fact: { kind: "builder-state" } };
  assert.equal(planCsharpExplicitSafetyExpression({}, selected, {}, {}, diagnostics, undefined,
    () => assert.fail("a rejected safety marker has no operand")) === undefined, true);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_SAFETY_MARKER_RUNTIME_POSITION_UNSUPPORTED");
});
