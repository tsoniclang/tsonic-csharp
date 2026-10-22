import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const header = `
  import type { int } from "@tsonic/csharp/types.js";
  import { mutableborrow, move, sharedborrow, keepalive } from "@tsonic/core/lang.js";
  import { keepalive as retain } from "@tsonic/core/lang.js";
  import * as core from "@tsonic/core/lang.js";
  function use(value: int): int { return value; }
`;

const markerMessage = (marker) =>
  `C# target does not implement source flow marker '${marker}'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.`;

const rejectedForms = [
  ["statements", "export function f(value: int): void { sharedborrow(value); mutableborrow(value); move(value); }",
    ["shared-borrow", "mutable-borrow", "move"]],
  ["initializer", "export function f(value: int): int { const a = move(value); return a; }", ["move"]],
  ["argument", "export function f(value: int): int { return use(sharedborrow(value)); }", ["shared-borrow"]],
  ["return", "export function f(value: int): int { return mutableborrow(value); }", ["mutable-borrow"]],
  ["arrow", "export function f(value: int): int { const g = (): int => move(value); return g(); }", ["move"]],
  ["conditional", "export function f(value: int, flag: boolean): int { return flag ? move(value) : value; }", ["move"]],
  ["nested", "export function f(value: int): int { return use(use(sharedborrow(value))); }", ["shared-borrow"]],
];

for (const [name, body, markers] of rejectedForms) {
  test(`source-flow marker in ${name} position is rejected at analysis admission before planning`, () => {
    const compiled = compileCsharpSource({ sourceText: header + body });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.result.program === undefined, true, "rejected before program publication");
    assert.equal(compiled.result.plan === undefined, true, "rejected before planning");
    assert.deepEqual([...compiled.artifacts], []);
    assert.deepEqual(
      compiled.result.diagnostics.map(({ code, category, source, message }) => ({ code, category, source, message })),
      markers.map((marker) => ({
        code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
        category: "error",
        source: "tsonic-csharp",
        message: markerMessage(marker),
      })),
    );
    for (const diagnostic of compiled.result.diagnostics) {
      assert.equal(compiled.source.ast.kindName(diagnostic.sourceNode), "KindCallExpression");
    }
  });
}

const acceptedForms = [
  ["statement", "export function f(value: int): int { keepalive(value); return value; }", 1],
  ["alias and namespace", "export function f(value: int): int { retain(value); core.keepalive(value); return value; }", 2],
  ["arrow", "export function f(value: int): int { const g = (): void => { keepalive(value); }; g(); return value; }", 1],
  ["if", "export function f(value: int, flag: boolean): int { if (flag) { keepalive(value); } return value; }", 1],
];

for (const [name, body, count] of acceptedForms) {
  test(`admitted keep-alive in ${name} position is published as sealed data and emitted`, () => {
    const compiled = compileCsharpSource({ sourceText: header + body });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assertNoTargetDiagnostics(compiled.result.diagnostics);
    const output = compiled.artifacts.get("src/Index.cs");
    assert.equal(output.split("global::System.GC.KeepAlive(value)").length - 1, count);
    const records = compiled.result.program.records;
    const ast = compiled.result.program.source.ast;
    const calls = [];
    const visit = (node) => {
      if (ast.is.IsCallExpression(node)) calls.push(records.selectedCall.get(node));
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    for (const sourceFile of csharpProgramSourceFiles(compiled.result.program)) visit(sourceFile);
    const keepAlive = calls.filter((call) => call?.form.kind === "keep-alive");
    assert.equal(keepAlive.length, count);
    for (const call of keepAlive) assert.equal(call.form.sourceFlow.kind, "keep-alive");
  });
}

test("a local function named like a source-flow marker is an ordinary call with no sealed source-flow selection", () => {
  const compiled = compileCsharpSource({ sourceText: `${header}
    function move2(value: int): int { return value; }
    export function f(value: int): int { return move2(value); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assertNoTargetDiagnostics(compiled.result.diagnostics);
  const records = compiled.result.program.records;
  const ast = compiled.result.program.source.ast;
  const calls = [];
  const visit = (node) => {
    if (ast.is.IsCallExpression(node)) calls.push(records.selectedCall.get(node));
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of csharpProgramSourceFiles(compiled.result.program)) visit(sourceFile);
  assert.ok(calls.length > 0);
  for (const call of calls) assert.equal(call?.form.kind === "target", true, "ordinary calls select the target call form");
});
