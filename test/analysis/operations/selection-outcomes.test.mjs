import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

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
    assert.equal(compiled.result.program === undefined, true, "program is not published");
    assert.equal(compiled.result.plan === undefined, true, "plan is not published");
    assert.equal(compiled.artifacts.size, 0, "no artifacts are published");
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
    assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
    const output = compiled.artifacts.get("src/Index.cs");
    assert.equal(output.split("global::System.GC.KeepAlive(value)").length - 1, count);
    const records = compiled.result.program.records;
    const ast = compiled.result.program.source.ast;
    const calls = [];
    const visit = (node) => {
      if (ast.is.IsCallExpression(node)) calls.push(records.selectedCall.get(node));
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    for (const sourceFile of compiled.result.program.sourceFiles) visit(sourceFile);
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
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const records = compiled.result.program.records;
  const ast = compiled.result.program.source.ast;
  const calls = [];
  const visit = (node) => {
    if (ast.is.IsCallExpression(node)) calls.push(records.selectedCall.get(node));
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of compiled.result.program.sourceFiles) visit(sourceFile);
  assert.ok(calls.length > 0);
  for (const call of calls) assert.equal(call?.form.kind === "target", true, "an ordinary call has the target form and no source-flow selection");
});

const safetyOptions = { targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } };
const erasureHeader = `
  import { safety, move, keepalive, attribute as annotate } from "@tsonic/core/lang.js";
  import type { int } from "@tsonic/csharp/types.js";
  import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
  function use(value: int): int { return value; }
`;

const erasedForms = [
  ["source-flow marker in a top-level safety value root", "", "const value: int = 1 as int; safety(move(value)).requiresunsafe(); export const k = 1;"],
  ["source-flow marker in a safety value root inside a function", "", "export function f(value: int): int { safety(move(value)).requiresunsafe(); return value; }"],
  ["source-flow marker inside an arrow in a safety value root", "", "const value: int = 1 as int; safety(() => move(value)).requiresunsafe(); export const k = 1;"],
  ["keep-alive in a safety value root", "", "const value: int = 1 as int; safety(keepalive(value)).requiresunsafe(); export const k = 1;"],
  ["ordinary call in a safety value root", "", "safety(use(1 as int)).requiresunsafe(); export const k = 1;"],
  ["rejected JS construction in a safety value root", "js", "safety(new Proxy({}, {})).requiresunsafe(); export const k = 1;"],
  ["rejected JS-value property write in a safety value root", "js",
    "type T = { a: unknown }; const x: T = { a: 1 as unknown }; safety((x.toString = () => \"y\")).requiresunsafe(); export const k = 1;"],
];

for (const [name, surface, body] of erasedForms) {
  test(`${name} is an erased statement whose outcomes are not reported`, () => {
    const sourceText = surface === "js"
      ? `import { safety } from "@tsonic/core/lang.js";\n${body}`
      : erasureHeader + body;
    const compiled = compileCsharpSource({ ...safetyOptions, ...(surface === "js" ? { surface } : {}), sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
    assert.equal(compiled.artifacts.has("src/Index.cs"), true, "the program publishes its C# source");
    const program = compiled.result.program;
    const ast = program.source.ast;
    const erased = [];
    const visit = (node) => {
      if (ast.is.IsExpressionStatement(node)) erased.push(program.records.erasedStatement.get(node));
      ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
    };
    for (const sourceFile of program.sourceFiles) visit(sourceFile);
    assert.equal(erased.filter((value) => value === true).length, 1, "exactly the safety statement is erased");
    assert.equal(compiled.artifacts.get("src/Index.cs").includes("requiresunsafe"), false, "the erased statement emits no C#");
  });
}

test("a source-flow marker inside a demanded attribute invocation is still rejected at admission", () => {
  const compiled = compileCsharpSource({ sourceText: `${erasureHeader}
    export class Subject { run(): void {} }
    const value: int = 1 as int;
    annotate<Subject>().add(() => new ObsoleteAttribute(move(value) === (1 as int) ? "a" : "b"));
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.program === undefined, true, "program is not published");
  assert.equal(compiled.artifacts.size, 0, "no artifacts are published");
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, category, source, message }) => ({ code, category, source, message })),
    [{ code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED", category: "error", source: "tsonic-csharp", message: markerMessage("move") }],
  );
  assert.equal(compiled.source.ast.kindName(compiled.result.diagnostics[0].sourceNode), "KindCallExpression");
});

test("an attribute statement is erased while its admitted invocation is emitted", () => {
  const compiled = compileCsharpSource({ sourceText: `${erasureHeader}
    export class Subject { run(): void {} }
    annotate<Subject>().add(() => new ObsoleteAttribute("old", true));
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(output.includes('[System.ObsoleteAttribute("old", true)]'), true, "the attribute is emitted on its subject");
  assert.equal(output.includes("annotate"), false, "the builder statement emits no C#");
  const program = compiled.result.program;
  const ast = program.source.ast;
  const statements = [];
  const visit = (node) => {
    if (ast.is.IsExpressionStatement(node)) statements.push(program.records.erasedStatement.get(node));
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) visit(sourceFile);
  assert.equal(statements.length === 1 && statements[0] === true, true, "the one attribute statement is erased");
});

test("an ordinary expression statement is consumed, not erased", () => {
  const compiled = compileCsharpSource({ sourceText: `${erasureHeader}
    export function f(value: int): int { use(value); return value; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const statements = [];
  const visit = (node) => {
    if (ast.is.IsExpressionStatement(node)) statements.push(program.records.erasedStatement.get(node));
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) visit(sourceFile);
  assert.equal(statements.length === 1 && statements[0] === false, true, "the call statement is not erased");
});
