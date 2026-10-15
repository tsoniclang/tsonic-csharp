import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const forcedMessage = "Forced operation admission issue.";
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    const source = String(loaded.source);
    if (url.endsWith("/dist/analysis/operations/conversion-admission.js")) {
      const operationMarker = "export function csharpOperationConversionIssue(";
      const callMarker = "export function csharpSelectedCallConversionIssue(";
      assert.equal(source.includes(operationMarker) && source.includes(callMarker), true,
        "the operation and call conversion issue producers are the injection points");
      return { ...loaded, shortCircuit: true, source: source
        .replace(operationMarker, "function admittedOperationConversionIssue(")
        .replace(callMarker, "function admittedSelectedCallConversionIssue(") +
        "\nexport function csharpOperationConversionIssue(node, conversion, code) {\n" +
        "  const forced = globalThis.forcedOperationIssue;\n" +
        "  if (forced !== undefined && forced.code === code) {\n" +
        "    forced.subjects.push(node);\n" +
        `    return Object.freeze({ node, code, message: ${JSON.stringify(forcedMessage)} });\n` +
        "  }\n" +
        "  return admittedOperationConversionIssue(node, conversion, code);\n" +
        "}\n" +
        "export function csharpSelectedCallConversionIssue(policy, selection) {\n" +
        "  const forced = globalThis.forcedOperationIssue;\n" +
        "  if (forced !== undefined && forced.code === \"CSHARP_CALL_ARGUMENT_CONVERSION_NOT_PROVEN\" && selection?.kind === \"resolved\") {\n" +
        "    forced.subjects.push(selection.source.call);\n" +
        `    return Object.freeze({ node: selection.source.call, code: forced.code, message: ${JSON.stringify(forcedMessage)} });\n` +
        "  }\n" +
        "  return admittedSelectedCallConversionIssue(policy, selection);\n" +
        "}\n" };
    }
    if (url.endsWith("/dist/policy/operations/control-flow/await-completions.js")) {
      const marker = "export function selectCsharpAwaitCompletion(";
      assert.equal(source.includes(marker), true, "the await completion selector is the injection point");
      return { ...loaded, shortCircuit: true, source: source.replace(marker, "function selectedCsharpAwaitCompletion(") +
        "\nexport function selectCsharpAwaitCompletion(carrier, definitions) {\n" +
        "  const completion = selectedCsharpAwaitCompletion(carrier, definitions);\n" +
        "  const forced = globalThis.forcedOperationIssue;\n" +
        "  if (completion === undefined || forced?.code !== \"CSHARP_AWAIT_RESULT_MAPPING_NOT_PROVEN\") return completion;\n" +
        "  return { ...completion, alternatives: completion.alternatives.map(alternative => alternative.resultMapping === undefined\n" +
        "    ? alternative\n" +
        "    : { ...alternative, resultMapping: { ...alternative.resultMapping, arms: [...alternative.resultMapping.arms].reverse() } }) };\n" +
        "}\n" };
    }
    return loaded;
  },
});

const { compileCsharpSource } = await import("../../helpers/direct-csharp-session.mjs");

function compileWithForcedIssue(code, options) {
  const forced = { code, subjects: [] };
  globalThis.forcedOperationIssue = forced;
  try {
    return { compiled: compileCsharpSource(options), forced };
  } finally {
    globalThis.forcedOperationIssue = undefined;
  }
}

function expressionStatements(program) {
  const ast = program.source.ast;
  const statements = [];
  const visit = (node) => {
    if (ast.is.IsExpressionStatement(node)) statements.push(node);
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) visit(sourceFile);
  return statements;
}

function diagnosticsText(compiled) {
  return compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ");
}

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
    assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
    assert.equal(compiled.artifacts.has("src/Index.cs"), true, "the program publishes its C# source");
    const program = compiled.result.program;
    const erased = expressionStatements(program).map((statement) => program.records.erasedStatement.get(statement));
    assert.equal(erased.filter((value) => value === true).length, 1, "exactly the safety statement is erased");
    assert.equal(compiled.artifacts.get("src/Index.cs").includes("requiresunsafe"), false, "the erased statement emits no C#");
  });
}

test("an attribute statement is erased while its admitted invocation is emitted", () => {
  const compiled = compileCsharpSource({ sourceText: `${erasureHeader}
    export class Subject { run(): void {} }
    annotate<Subject>().add(() => new ObsoleteAttribute("old", true));
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(output.includes('[System.ObsoleteAttribute("old", true)]'), true, "the attribute is emitted on its subject");
  assert.equal(output.includes("annotate"), false, "the builder statement emits no C#");
  const program = compiled.result.program;
  const statements = expressionStatements(program).map((statement) => program.records.erasedStatement.get(statement));
  assert.equal(statements.length === 1 && statements[0] === true, true, "the one attribute statement is erased");
});

test("an ordinary expression statement is consumed, not erased", () => {
  const compiled = compileCsharpSource({ sourceText: `${erasureHeader}
    export function f(value: int): int { use(value); return value; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
  const program = compiled.result.program;
  const statements = expressionStatements(program).map((statement) => program.records.erasedStatement.get(statement));
  assert.equal(statements.length === 1 && statements[0] === false, true, "the call statement is not erased");
});

const forcedHeader = `
  import { safety, unsafecontext, attribute as annotate } from "@tsonic/core/lang.js";
  import type { int } from "@tsonic/csharp/types.js";
  import { Math as NetMath, ObsoleteAttribute } from "@tsonic/dotnet/System.js";
  export class Subject { run(): void {} }
  class Holder { value: int = 1 as int; text: string = "a"; }
`;
const callIssue = "CSHARP_CALL_ARGUMENT_CONVERSION_NOT_PROVEN";
const memberIssue = "CSHARP_MEMBER_RECEIVER_CONVERSION_NOT_PROVEN";
const elementIssue = "CSHARP_ELEMENT_READ_CONVERSION_NOT_PROVEN";
const awaitIssue = "CSHARP_AWAIT_RESULT_MAPPING_NOT_PROVEN";
const awaitMappingMessage = "Union conversion requires exact sealed arm coverage and native absence correspondence.";
const settle = "export async function settle(pending: Promise<string | number> | Promise<boolean>): Promise<int>";

const erasedIssueForms = [
  [callIssue, "a safety value root", `export function f(v: int): int { safety(NetMath.Abs(v)).requiresunsafe(); return v; }`, "requiresunsafe"],
  [elementIssue, "a safety value root", `export function f(values: int[]): int { safety(values[0]).requiresunsafe(); return 1 as int; }`, "requiresunsafe"],
  [memberIssue, "a safety value root", `export function f(holder: Holder): int { safety(holder.value).requiresunsafe(); return 1 as int; }`, "requiresunsafe"],
  [memberIssue, "a remaining-block unsafe-context marker", `export function f(): int { unsafecontext(); return 1 as int; }`, "unsafecontext"],
  [memberIssue, "an attribute statement outside its invocation",
    `annotate<Subject>().method(subject => subject.run).add(() => new ObsoleteAttribute("run"));`, "annotate"],
  [awaitIssue, "a safety value root", `${settle} { safety(await pending).requiresunsafe(); return 1 as int; }`, "requiresunsafe"],
];

for (const [code, placement, body, erasedText] of erasedIssueForms) {
  test(`${code} inside ${placement} is not reported because the statement is erased`, () => {
    const { compiled, forced } = compileWithForcedIssue(code, { ...safetyOptions, sourceText: forcedHeader + body });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the program is published");
    const ast = program.source.ast;
    const erased = expressionStatements(program).filter((statement) => program.records.erasedStatement.get(statement));
    assert.equal(erased.length === 1, true, "exactly the statement carrying the issue is erased");
    const insideErased = forced.subjects.filter((node) => ast.pos(node) >= ast.pos(erased[0]) && ast.end(node) <= ast.end(erased[0]));
    assert.equal(code === awaitIssue || insideErased.length > 0, true, "the forced issue had a subject inside the erased statement");
    assert.equal(compiled.artifacts.get("src/Index.cs").includes(erasedText), false, "the erased statement emits no C#");
  });
}

const reportedIssueForms = [
  [callIssue, "an ordinary statement", `export function f(v: int): int { return NetMath.Abs(v); }`, ["KindCallExpression:NetMath.Abs(v)"]],
  [elementIssue, "an ordinary statement", `export function f(values: int[]): int { return values[0]; }`, ["KindElementAccessExpression:values[0]"]],
  [memberIssue, "an ordinary statement", `export function f(holder: Holder): int { return holder.value; }`, ["KindPropertyAccessExpression:holder.value"]],
  [awaitIssue, "an ordinary statement",
    "export async function settle(pending: Promise<string | number> | Promise<boolean>): Promise<string | number | boolean> { return await pending; }",
    ["KindAwaitExpression:await pending"]],
  [elementIssue, "a demanded attribute invocation",
    `const values: int[] = [1 as int]; annotate<Subject>().add(() => new ObsoleteAttribute(values[0] === (1 as int) ? "a" : "b"));`,
    ["KindElementAccessExpression:values[0]"]],
  [memberIssue, "a demanded attribute invocation",
    `const holder = new Holder(); annotate<Subject>().add(() => new ObsoleteAttribute(holder.text));`,
    ["KindPropertyAccessExpression:holder.text"]],
];

for (const [code, placement, body, expected] of reportedIssueForms) {
  test(`${code} inside ${placement} is still reported at operation admission`, () => {
    const sourceText = forcedHeader + body;
    const { compiled } = compileWithForcedIssue(code, { ...safetyOptions, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    const ast = compiled.source.ast;
    const reported = compiled.result.diagnostics.map((diagnostic) =>
      `${ast.kindName(diagnostic.sourceNode)}:${sourceText.slice(ast.pos(diagnostic.sourceNode), ast.end(diagnostic.sourceNode)).trim()}`);
    assert.deepEqual(reported, expected, "only the issues outside erased statements and inside demanded invocations are reported");
    const message = code === awaitIssue ? awaitMappingMessage : forcedMessage;
    assert.equal(compiled.result.diagnostics.every((diagnostic) => diagnostic.code === code && diagnostic.message === message),
      true, "each reported diagnostic is the operation admission issue");
    assert.equal(compiled.result.program === undefined, true, "the program is not published");
  });
}

test("a source-flow marker inside a demanded attribute invocation is still rejected at admission", () => {
  const sourceText = `${erasureHeader}
    export class Subject { run(): void {} }
    const value: int = 1 as int;
    annotate<Subject>().add(() => new ObsoleteAttribute(move(value) === (1 as int) ? "a" : "b"));
  `;
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.program === undefined, true, "program is not published");
  assert.equal(compiled.artifacts.size, 0, "no artifacts are published");
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, category, source, message }) => ({ code, category, source, message })),
    [{ code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION", category: "error", source: "tsonic-csharp",
      message: "C# attribute application argument 1 is not a C# attribute constant; attribute arguments must be literals, .NET literal fields, native operators over constants, or one-dimensional arrays of them." }],
  );
  assert.equal(compiled.source.ast.kindName(compiled.result.diagnostics[0].sourceNode), "KindConditionalExpression");
  const { compiled: forcedCompiled, forced } = compileWithForcedIssue(memberIssue, { sourceText });
  const ast = forcedCompiled.source.ast;
  const subjects = new Set(forced.subjects);
  const invocationSubjects = [...subjects].filter((node) => sourceText.slice(ast.pos(node), ast.end(node)).trim() === "move(value)");
  assert.equal(invocationSubjects.length === 1 && subjects.size > 1, true,
    "the forced issue reaches the invocation's marker call and the statement's builder chain");
  assert.deepEqual(forcedCompiled.result.diagnostics.map((diagnostic) => diagnostic.sourceNode), invocationSubjects,
    "only the demanded invocation's issue is reported; the erased statement's own issues are not");
});
