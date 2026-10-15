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
        "  forced.awaitCompletions += 1;\n" +
        "  return { ...completion, alternatives: completion.alternatives.map(alternative => alternative.resultMapping === undefined\n" +
        "    ? alternative\n" +
        "    : { ...alternative, resultMapping: { ...alternative.resultMapping, arms: [...alternative.resultMapping.arms].reverse() } }) };\n" +
        "}\n" };
    }
    return loaded;
  },
});

const { compileCsharpSource } = await import("../../helpers/direct-csharp-session.mjs");

function compile(options) {
  return { ...compileCsharpSource(options), text: options.sourceText };
}

function compileWithForcedIssue(code, options) {
  const forced = { code, subjects: [], awaitCompletions: 0 };
  globalThis.forcedOperationIssue = forced;
  try {
    return { compiled: compile(options), forced };
  } finally {
    globalThis.forcedOperationIssue = undefined;
  }
}

function sourceText(compiled, node) {
  const ast = compiled.source.ast;
  return compiled.text.slice(ast.pos(node), ast.end(node)).trim();
}

function erasureOutcomes(compiled) {
  const program = compiled.result.program;
  assert.equal(typeof program?.records.erasedStatement?.get === "function", true,
    "the published program carries the erasedStatement reader");
  const ast = program.source.ast;
  const outcomes = [];
  const visit = (node) => {
    if (ast.is.IsExpressionStatement(node)) {
      outcomes.push({ node, text: sourceText(compiled, node), erased: program.records.erasedStatement.get(node) });
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of program.sourceFiles) visit(sourceFile);
  return outcomes;
}

function diagnosticsText(compiled) {
  return compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ");
}

function assertOneErased(outcomes, erasedPrefix, ordinaryText) {
  const erased = outcomes.filter((outcome) => outcome.erased === true);
  assert.equal(erased.length === 1 && erased[0].text.startsWith(erasedPrefix), true,
    `exactly the statement starting '${erasedPrefix}' is erased: ${JSON.stringify(outcomes.map(({ text, erased }) => [text, erased]))}`);
  const ordinary = outcomes.filter((outcome) => outcome.text === ordinaryText);
  assert.equal(ordinary.length === 1 && ordinary[0].erased === false, true,
    `the ordinary statement '${ordinaryText}' is not erased`);
  return erased[0];
}

const safetyOptions = { targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } };
const erasureHeader = `
  import { safety, move, keepalive, attribute as annotate } from "@tsonic/core/lang.js";
  import type { int } from "@tsonic/csharp/types.js";
  import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
  function use(value: int): int { return value; }
`;
const jsHeader = `
  import { safety } from "@tsonic/core/lang.js";
  function use(value: number): number { return value; }
`;

const erasedForms = [
  ["a source-flow marker statement in an uncalled block arrow root at top level", "", "use(1 as int);",
    "const value: int = 1 as int; use(1 as int); safety(() => { move(value); }).requiresunsafe(); export const k = 1;"],
  ["a source-flow marker in an uncalled arrow root inside a function", "", "use(value);",
    "export function f(value: int): int { use(value); safety(() => move(value)).requiresunsafe(); return value; }"],
  ["a source-flow marker in an uncalled arrow root at top level", "", "use(1 as int);",
    "const value: int = 1 as int; use(1 as int); safety(() => move(value)).requiresunsafe(); export const k = 1;"],
  ["a keep-alive in an uncalled arrow root", "", "use(1 as int);",
    "const value: int = 1 as int; use(1 as int); safety(() => keepalive(value)).requiresunsafe(); export const k = 1;"],
  ["an ordinary call in an uncalled arrow root", "", "use(2 as int);",
    "use(2 as int); safety(() => use(1 as int)).requiresunsafe(); export const k = 1;"],
  ["a rejected JS construction in an uncalled arrow root", "js", "use(1);",
    "use(1); safety(() => new Proxy({}, {})).requiresunsafe(); export const k = 1;"],
  ["a rejected JS-value property write in an uncalled arrow root", "js", "use(1);",
    "type T = { a: unknown }; const x: T = { a: 1 as unknown }; use(1); safety(() => (x.toString = () => \"y\")).requiresunsafe(); export const k = 1;"],
];

for (const [name, surface, ordinaryText, body] of erasedForms) {
  test(`${name} is an erased statement whose outcomes are not reported`, () => {
    const compiled = compile({ ...safetyOptions, ...(surface === "js" ? { surface } : {}),
      sourceText: (surface === "js" ? jsHeader : erasureHeader) + body });
    assert.equal(compiled.sourceDiagnosticsText === "", true, `the source checks: ${compiled.sourceDiagnosticsText}`);
    assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
    assert.equal(compiled.artifacts.has("src/Index.cs"), true, "the program publishes its C# source");
    assertOneErased(erasureOutcomes(compiled), "safety(", ordinaryText);
    assert.equal(compiled.artifacts.get("src/Index.cs").includes("requiresunsafe"), false, "the erased statement emits no C#");
  });
}

test("an attribute statement is erased while its admitted invocation is emitted", () => {
  const compiled = compile({ sourceText: `${erasureHeader}
    export class Subject { run(): void {} }
    use(1 as int);
    annotate<Subject>().add(() => new ObsoleteAttribute("old", true));
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `the source checks: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
  const output = compiled.artifacts.get("src/Index.cs");
  assert.equal(output.includes('[System.ObsoleteAttribute("old", true)]'), true, "the attribute is emitted on its subject");
  assert.equal(output.includes("annotate"), false, "the builder statement emits no C#");
  assertOneErased(erasureOutcomes(compiled), "annotate<Subject>()", "use(1 as int);");
});

test("an ordinary expression statement is consumed, not erased", () => {
  const compiled = compile({ sourceText: `${erasureHeader}
    export function f(value: int): int { use(value); return value; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `the source checks: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
  const outcomes = erasureOutcomes(compiled);
  assert.equal(outcomes.length === 1 && outcomes[0].erased === false, true, "the call statement is not erased");
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
const counter = "let counter: int = 0 as int; counter++;";

const erasedIssueForms = [
  [callIssue, "the call argument site, in an uncalled arrow root", "safety(", "requiresunsafe",
    `export function f(v: int): int { ${counter} safety(() => NetMath.Abs(v)).requiresunsafe(); return v; }`,
    "KindCallExpression:NetMath.Abs(v)"],
  [callIssue, "the construction argument site, in an uncalled arrow root", "safety(", "requiresunsafe",
    `export function f(): int { ${counter} safety(() => new ObsoleteAttribute("x")).requiresunsafe(); return 1 as int; }`,
    "KindNewExpression:new ObsoleteAttribute(\"x\")"],
  [elementIssue, "the element read site, in an uncalled arrow root", "safety(", "requiresunsafe",
    `export function f(values: int[]): int { ${counter} safety(() => values[0]).requiresunsafe(); return 1 as int; }`,
    "KindElementAccessExpression:values[0]"],
  [memberIssue, "the element receiver site, in an uncalled arrow root", "safety(", "requiresunsafe",
    `export function f(values: int[]): int { ${counter} safety(() => values[0]).requiresunsafe(); return 1 as int; }`,
    "KindElementAccessExpression:values[0]"],
  [memberIssue, "the property receiver site, in a declaration reference root", "safety(", "requiresunsafe",
    `export function f(holder: Holder): int { ${counter} safety(holder.value).requiresunsafe(); return 1 as int; }`,
    "KindPropertyAccessExpression:holder.value"],
  [memberIssue, "a remaining-block unsafe-context marker", "unsafecontext()", "unsafecontext",
    `export function f(): int { unsafecontext(); ${counter} return 1 as int; }`,
    "KindCallExpression:unsafecontext()"],
  [memberIssue, "an attribute statement outside its invocation", "annotate<Subject>()", "annotate",
    `${counter} annotate<Subject>().method(subject => subject.run).add(() => new ObsoleteAttribute("run"));`,
    "KindCallExpression:annotate<Subject>()"],
  [awaitIssue, "the await site, in an uncalled arrow root", "safety(", "requiresunsafe",
    `export async function settle(pending: Promise<string | number> | Promise<boolean>): Promise<int> { ${counter} safety(async () => await pending).requiresunsafe(); return 1 as int; }`,
    undefined],
];

for (const [code, placement, erasedPrefix, emittedMarker, body, forcedSubject] of erasedIssueForms) {
  test(`${code} at ${placement} is not reported because the statement is erased`, () => {
    const { compiled, forced } = compileWithForcedIssue(code, { ...safetyOptions, sourceText: forcedHeader + body });
    assert.equal(compiled.sourceDiagnosticsText === "", true, `the source checks: ${compiled.sourceDiagnosticsText}`);
    assert.equal(compiled.result.diagnostics.length === 0, true, diagnosticsText(compiled));
    assert.equal(compiled.result.program !== undefined, true, "the program is published");
    const erased = assertOneErased(erasureOutcomes(compiled), erasedPrefix, "counter++;");
    const ast = compiled.source.ast;
    const inside = (node) => ast.pos(node) >= ast.pos(erased.node) && ast.end(node) <= ast.end(erased.node);
    if (code === awaitIssue) {
      assert.equal(forced.awaitCompletions > 0, true, "the forced await result mapping was selected");
      const awaits = [];
      const visit = (node) => {
        if (ast.is.IsAwaitExpression(node)) awaits.push(node);
        ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
      };
      for (const sourceFile of compiled.result.program.sourceFiles) visit(sourceFile);
      assert.equal(awaits.length === 1 && inside(awaits[0]), true, "the program's only await is inside the erased statement");
    } else {
      const subjects = forced.subjects.filter(inside).map((node) => `${ast.kindName(node)}:${sourceText(compiled, node)}`);
      assert.equal(subjects.includes(forcedSubject), true,
        `the forced issue had the subject ${forcedSubject} inside the erased statement: ${JSON.stringify(subjects)}`);
    }
    assert.equal(compiled.artifacts.get("src/Index.cs").includes(emittedMarker), false,
      `the erased statement emits no C# (no '${emittedMarker}')`);
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
    const { compiled, forced } = compileWithForcedIssue(code, { ...safetyOptions, sourceText: forcedHeader + body });
    assert.equal(compiled.sourceDiagnosticsText === "", true, `the source checks: ${compiled.sourceDiagnosticsText}`);
    assert.equal(code !== awaitIssue || forced.awaitCompletions > 0, true, "the forced await result mapping was selected");
    const ast = compiled.source.ast;
    const reported = compiled.result.diagnostics.map((diagnostic) =>
      `${ast.kindName(diagnostic.sourceNode)}:${sourceText(compiled, diagnostic.sourceNode)}`);
    assert.equal(JSON.stringify(reported) === JSON.stringify(expected), true,
      `only the issues outside erased statements and inside demanded invocations are reported: ${JSON.stringify(reported)}`);
    const message = code === awaitIssue ? awaitMappingMessage : forcedMessage;
    assert.equal(compiled.result.diagnostics.every((diagnostic) => diagnostic.code === code && diagnostic.message === message),
      true, "each reported diagnostic is the operation admission issue");
    assert.equal(compiled.result.program === undefined, true, "the program is not published");
  });
}

test("a source-flow marker inside a demanded attribute invocation is still rejected at admission", () => {
  const text = `${erasureHeader}
    export class Subject { run(): void {} }
    const value: int = 1 as int;
    annotate<Subject>().add(() => new ObsoleteAttribute(move(value) === (1 as int) ? "a" : "b"));
  `;
  const compiled = compile({ sourceText: text });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `the source checks: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.result.program === undefined, true, "program is not published");
  assert.equal(compiled.artifacts.size, 0, "no artifacts are published");
  const captured = compiled.result.diagnostics.map(({ code, category, source, message, sourceNode }) =>
    ({ code, category, source, message, node: compiled.source.ast.kindName(sourceNode) }));
  assert.equal(JSON.stringify(captured) === JSON.stringify([{ code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION",
    category: "error", source: "tsonic-csharp",
    message: "C# attribute application argument 1 is not a C# attribute constant; attribute arguments must be literals, .NET literal fields, native operators over constants, or one-dimensional arrays of them.",
    node: "KindConditionalExpression" }]), true, `attribute admission rejects the demanded invocation's argument: ${JSON.stringify(captured)}`);
  const { compiled: forcedCompiled, forced } = compileWithForcedIssue(memberIssue, { sourceText: text });
  const ast = forcedCompiled.source.ast;
  const describe = (node) => `${ast.kindName(node)}:${sourceText(forcedCompiled, node)}`;
  const subjects = [...new Set(forced.subjects)].map(describe);
  assert.equal(subjects.includes("KindCallExpression:move(value)") && subjects.length > 1, true,
    `the forced issue reaches the invocation's marker call and the statement's builder chain: ${JSON.stringify(subjects)}`);
  const reported = forcedCompiled.result.diagnostics.map((diagnostic) => describe(diagnostic.sourceNode));
  assert.equal(JSON.stringify(reported) === JSON.stringify(["KindCallExpression:move(value)"]), true,
    `only the demanded invocation's issue is reported; the erased statement's own issues are not: ${JSON.stringify(reported)}`);
});
