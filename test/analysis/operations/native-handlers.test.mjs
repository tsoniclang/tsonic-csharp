import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpNativeHandlers } from "../../../dist/analysis/operations/native-handlers.js";
import { assertCsharpRequiredRecords } from "../../../dist/analysis/program/records/objects/required-records.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

function handlersByCallee(program) {
  const ast = program.source.ast;
  const handlers = [];
  for (const sourceFile of csharpProgramSourceFiles(program)) {
    const text = String(ast.getSourceText(sourceFile));
    const visit = (node) => {
      if (ast.is.IsCallExpression(node)) {
        const callee = ast.as.AsCallExpression(node)?.Expression;
        handlers.push([text.slice(ast.pos(callee), ast.end(callee)).trim(), program.records.nativeHandler.get(node)?.kind ?? "none"]);
      }
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    visit(sourceFile);
  }
  return handlers;
}

test("the operations walk records one native handler per claimed call and none for ordinary calls", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { unsafe as directUnsafe } from "@tsonic/csharp/lang.js";
      import { loadnativeptr } from "@tsonic/core/lang.js";
      import type { ptr } from "@tsonic/csharp/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      function unsafe(value: int32): int32 { return value; }
      export function direct(pointer: ptr<int32>): int32 { return directUnsafe(loadnativeptr(pointer)); }
      export function shadowed(value: int32): int32 { return unsafe(value); }
    `,
    targetOptions: { languageDialect: "csharp15-preview" },
  });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.diagnostics.length === 0, true,
    compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  assert.equal(typeof program?.records.nativeHandler?.get === "function", true,
    "the published program carries the nativeHandler reader");
  const handlers = handlersByCallee(program);
  const expected = [["directUnsafe", "explicit-safety"], ["loadnativeptr", "native-pointer"], ["unsafe", "none"]];
  assert.equal(handlers.length === expected.length, true,
    `three calls in source order, recorded ${handlers.map(([callee, handler]) => `${callee}=${handler}`).join(", ")}`);
  for (const [index, [callee, handler]] of expected.entries()) {
    assert.equal(handlers[index][0] === callee && handlers[index][1] === handler, true,
      `call ${index}: ${callee} claimed by ${handler}, recorded ${handlers[index][0]}=${handlers[index][1]}`);
  }
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(output.includes("return unsafe(*pointer);"), true, "the explicit-safety handler emits the unsafe expression");
});

test("the native finalizer writes the finite domain once and registers obligations independently of its reader", () => {
  const nodes = Array.from({ length: 6 }, () => ({}));
  const payloads = [{ kind: "field" }, { kind: "unsafe-context" }, { kind: "resolved" }, { kind: "layout-query", value: 0 }, { kind: "location-address" }]
    .map(value => Object.freeze(value));
  const counts = new Map();
  const reader = index => ({ get(node) {
    const key = `${index}:${nodes.indexOf(node)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return node === nodes[index] ? payloads[index] : undefined;
  } });
  const requirements = [];
  const nativeHandler = analyzeCsharpNativeHandlers(nodes, { memoryBinding: reader(0), safetyOperation: reader(1),
    jsStringConversion: reader(2), nativePointer: reader(3), typedLocation: reader(4) }, requirements);
  const kinds = ["memory-binding", "explicit-safety", "js-string-conversion", "native-pointer", "typed-location"];
  assert.equal(counts.size === nodes.length * kinds.length, true, "every candidate is read for every exact node");
  assert.equal([...counts.values()].every(count => count === 1), true, "every input is read exactly once per node");
  assert.equal(requirements.length === 5, true, "all five selected roots register independent requirements");
  for (const [index, kind] of kinds.entries()) {
    const selected = nativeHandler.get(nodes[index]);
    assert.equal(selected.kind === kind, true, `the selected ${kind} root is retained`);
    assert.equal(selected.selection === payloads[index], true, kind);
    assert.equal(Object.isFrozen(selected), true, kind);
    assert.equal(nativeHandler.get(nodes[index]) === selected, true, kind);
    assert.equal(requirements[index].subject === nodes[index] && requirements[index].family === "nativeHandler", true,
      `${kind}: the exact subject is required in the canonical family`);
  }
  assert.equal(nativeHandler.get(nodes[5]) === undefined, true, "ordinary expressions are unclaimed");
  assert.equal([...counts.values()].every(count => count === 1), true, "sealed reads perform no selection");
  const omitted = { nativeHandler: { get: () => undefined } };
  assert.throws(() => assertCsharpRequiredRecords(omitted, requirements), error =>
    error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic?.sourceNode === nodes[0] &&
    /nativeHandler/u.test(error.diagnostic.message), "a missing selected handler fails at its exact required source node");
  assert.doesNotThrow(() => assertCsharpRequiredRecords({ nativeHandler }, requirements), "the complete selected reader satisfies every requirement");
});

test("an exact JS-string marker publishes its identity completion and leaves same-spelled local functions ordinary", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import { jsstr as exactJsString } from "@tsonic/js/lang.js";
    import type { JsString } from "@tsonic/js/types.js";
    export function exact(input: string): string { const value: JsString = exactJsString(input); return value.toWellFormed(); }
    function jsstr(value: string): string { return value; }
    export function ordinary(input: string): string { return jsstr(input); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.diagnostics.length === 0, true,
    compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const handlers = handlersByCallee(compiled.result.program);
  assert.equal(handlers.some(([callee, kind]) => callee === "exactJsString" && kind === "js-string-conversion"), true,
    "the aliased exact JS-string marker has the selected native handler");
  assert.equal(handlers.some(([callee, kind]) => callee === "jsstr" && kind === "none"), true,
    "the same-spelled local jsstr remains an ordinary call");
});
